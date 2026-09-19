import { test } from "node:test";
import assert from "node:assert/strict";
import { packMp3, timestampTag } from "../lib/audio/mp3";
import { eventPlaylist, readyChapters } from "../lib/audio/playlist";
import { chapterAtTime, type AudioAsset } from "../lib/audio/types";
import { publicAddress } from "../lib/hls/public-url";

test("MP3 segments use measured samples and valid ID3 timestamps", () => {
  // MPEG-2 layer III, 48kbps, 24kHz: 144 bytes / frame, 576 samples.
  const frame = Buffer.alloc(144);
  frame.set([0xff, 0xf3, 0x64, 0x00]);
  const parts = packMp3(Buffer.concat(Array.from({ length: 1000 }, () => frame)));
  assert.equal(parts.length, 4);
  assert.ok(Math.abs(parts.reduce((n, p) => n + p.duration, 0) - 24) < 1e-8);
  let elapsed = 0;
  for (const part of parts) {
    assert.ok(part.duration <= 6);
    assert.equal(part.data.subarray(0, 3).toString(), "ID3");
    assert.equal(part.data.subarray(10, 14).toString(), "PRIV");
    const owner = Buffer.from("com.apple.streaming.transportStreamTimestamp\0");
    const start = part.data.indexOf(owner) + owner.length;
    assert.equal(part.data.readBigUInt64BE(start), BigInt(Math.round(elapsed * 90000)));
    elapsed += part.duration;
  }
});

test("MP3 rejects empty, corrupt and truncated responses; ignores ID3 size in duration", () => {
  assert.throws(() => packMp3(Buffer.alloc(0)));
  assert.throws(() => packMp3(Buffer.from("not audio")));
  assert.throws(() => packMp3(Buffer.from([0xff, 0xf3, 0x64, 0])));
  const frame = Buffer.alloc(144); frame.set([0xff, 0xf3, 0x64, 0]);
  assert.equal(packMp3(Buffer.concat([timestampTag(0), frame]))[0].duration, 0.024);
});

function asset(id: string): AudioAsset {
  return { id, generation: "test", user_id: "owner", bytes: 0, voice: "voice", chapter: { url: `https://example.com/book/${id}`, title: id, source: "example.com", paragraphs: ["a", "b"], nextUrl: null, prevUrl: null },
    chunks: ["a", "b"], audio_chunks: [0, 1].map((i) => ({ chunk_index: i, bytes: 100, duration: 12, parts: [{ path: `${i}/0`, duration: 6 }, { path: `${i}/1`, duration: 6 }] })) };
}

test("an EVENT playlist only appends complete chapters with stable URLs and timing", () => {
  const first = [{ ordinal: 0, asset: asset("a") }];
  const partial = asset("b"); partial.audio_chunks.pop();
  assert.equal(readyChapters([...first, { ordinal: 1, asset: partial }]).length, 1);
  const all = [...first, { ordinal: 1, asset: asset("b") }, { ordinal: 2, asset: asset("c") }];
  const before = eventPlaylist(readyChapters(first), first, "session", "token", false);
  const after = eventPlaylist(readyChapters(all), all, "session", "token", false);
  assert.ok(after.startsWith(before));
  assert.equal(after.includes("#EXT-X-ENDLIST"), false);
  assert.equal(chapterAtTime(readyChapters(all), 55)?.chapter.title, "c");
  assert.equal(chapterAtTime(readyChapters(all), 24)?.chapter.title, "b");
  assert.equal(readyChapters(all)[2].start, 48);
  assert.ok(eventPlaylist(readyChapters(all), all, "session", "token", true).endsWith("#EXT-X-ENDLIST\n"));
});

test("sleep playlists stop at a native media boundary without JavaScript", () => {
  const rows = [{ ordinal: 0, asset: asset("a") }, { ordinal: 1, asset: asset("b") }];
  const playlist = eventPlaylist(readyChapters(rows), rows, "s", "t", false, 24);
  assert.ok(playlist.endsWith("#EXT-X-ENDLIST\n"));
  assert.equal(playlist.includes("chapter=1"), false);
  assert.equal((playlist.match(/EXTINF/g) ?? []).length, 4);
});

test("public URL guard excludes internal IPv4, mapped IPv6 and localhost", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.0.8", "192.0.2.1", "192.88.99.1", "198.51.100.1", "203.0.113.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1"]) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});

test("public URL guard permits Amethyst Writers' public WordPress addresses", () => {
  for (const ip of ["192.0.78.131", "192.0.78.199", "192.0.1.1", "192.0.255.255"]) assert.equal(publicAddress(ip), true, ip);
});
