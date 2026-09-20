import { test } from "node:test";
import assert from "node:assert/strict";
import { packMp3, retimestamp, timestampTag } from "../lib/audio/mp3";
import { eventPlaylist, readyChapters } from "../lib/audio/playlist";
import { restoreApplies } from "../lib/audio/restore";
import { chapterAtTime, LOOKAHEAD, type AudioAsset } from "../lib/audio/types";
import { publicAddress } from "../lib/hls/public-url";

const TIMESTAMP_OWNER = Buffer.from("com.apple.streaming.transportStreamTimestamp\0");

function readPts(buf: Buffer) {
  const start = buf.indexOf(TIMESTAMP_OWNER) + TIMESTAMP_OWNER.length;
  return Number(buf.readBigUInt64BE(start)) / 90000;
}

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
    const start = part.data.indexOf(TIMESTAMP_OWNER) + TIMESTAMP_OWNER.length;
    assert.equal(part.data.readBigUInt64BE(start), BigInt(Math.round(elapsed * 90000)));
    elapsed += part.duration;
  }
});

test("retimestamp overwrites the Apple HLS ID3 PRIV clock in place", () => {
  const frame = Buffer.alloc(144);
  frame.set([0xff, 0xf3, 0x64, 0x00]);
  const [part] = packMp3(frame);
  assert.equal(readPts(part.data), 0);
  retimestamp(part.data, 93.72);
  assert.ok(Math.abs(readPts(part.data) - 93.72) < 1e-4);
  retimestamp(part.data, 186.288);
  assert.ok(Math.abs(readPts(part.data) - 186.288) < 1e-4);
  assert.throws(() => retimestamp(Buffer.from([0xff, 0xf3, 0x64, 0x00]), 1));
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

test("a session playlist only appends complete chapters with stable URLs and timing", () => {
  const first = [{ ordinal: 0, asset: asset("a") }];
  const partial = asset("b"); partial.audio_chunks.pop();
  assert.equal(readyChapters([...first, { ordinal: 1, asset: partial }]).length, 1);
  const all = [...first, { ordinal: 1, asset: asset("b") }, { ordinal: 2, asset: asset("c") }];
  const before = eventPlaylist(readyChapters(first), first, "session", "token");
  const after = eventPlaylist(readyChapters(all), all, "session", "token");
  const segments = (playlist: string) => playlist.replace(/#EXT-X-ENDLIST\n$/, "");
  assert.ok(after.startsWith(segments(before)));
  assert.equal(chapterAtTime(readyChapters(all), 55)?.chapter.title, "c");
  assert.equal(chapterAtTime(readyChapters(all), 24)?.chapter.title, "b");
  assert.equal(readyChapters(all)[2].start, 48);
});

// A playlist iOS considers open is reported as live: no duration for the lock
// screen, and the whole playlist re-downloaded every few seconds for as long as
// playback lasts. Later chapters are picked up by re-reading it instead.
// Segments share one continuous timeline (media route rewrites ID3 clocks), so
// there must be no discontinuities and no VOD type (playlist still grows).
test("a session playlist is always closed with a continuous timeline", () => {
  const rows = [{ ordinal: 0, asset: asset("a") }];
  rows[0].asset.audio_chunks[0].parts[0].duration = 6.5;
  const playlist = eventPlaylist(readyChapters(rows), rows, "session", "token");
  assert.ok(playlist.endsWith("#EXT-X-ENDLIST\n"));
  assert.ok(playlist.includes("#EXT-X-TARGETDURATION:7"));
  assert.equal(playlist.includes("#EXT-X-PLAYLIST-TYPE:VOD"), false);
  assert.equal(playlist.includes("#EXT-X-DISCONTINUITY"), false);
  // Four segments across two chunks: continuous EXTINF sequence.
  const durations = [...playlist.matchAll(/#EXTINF:([0-9.]+),/g)].map((m) => Number(m[1]));
  assert.equal(durations.length, 4);
  let elapsed = 0;
  for (const d of durations) {
    assert.ok(d > 0);
    elapsed += d;
  }
  assert.ok(Math.abs(elapsed - (6.5 + 6 + 6 + 6)) < 1e-9);
});

test("sleep playlists stop at a native media boundary without JavaScript", () => {
  const rows = [{ ordinal: 0, asset: asset("a") }, { ordinal: 1, asset: asset("b") }];
  const playlist = eventPlaylist(readyChapters(rows), rows, "s", "t", 24);
  assert.ok(playlist.endsWith("#EXT-X-ENDLIST\n"));
  assert.equal(playlist.includes("chapter=1"), false);
  assert.equal((playlist.match(/EXTINF/g) ?? []).length, 4);
});

// A session time is meaningless on another session's timeline. Matching one by
// chapter URL seeked an absolute position into a fresh session's playlist,
// dropping playback back into an earlier chapter.
test("a queued restore only applies to the timeline that produced it", () => {
  const at = Date.now();
  const session = { chapter: "https://example.com/ch2", time: 1973.5, sessionId: "A", at };
  assert.equal(restoreApplies(session, { chapter: "https://example.com/ch2", sessionId: "A" }), true);
  // Same chapter, different session: the origin moved, so the time is garbage.
  assert.equal(restoreApplies(session, { chapter: "https://example.com/ch2", sessionId: "B" }), false);
  // Same chapter, no session at all: absolute time cannot be chapter-relative.
  assert.equal(restoreApplies(session, { chapter: "https://example.com/ch2" }), false);
  // A different chapter of the same session is fine; the time is absolute.
  assert.equal(restoreApplies(session, { chapter: "https://example.com/ch7", sessionId: "A" }), true);

  const single = { chapter: "https://example.com/ch2", time: 42, at };
  assert.equal(restoreApplies(single, { chapter: "https://example.com/ch2" }), true);
  assert.equal(restoreApplies(single, { chapter: "https://example.com/ch3" }), false);
  // Chapter-relative time must never be seeked into a session playlist.
  assert.equal(restoreApplies(single, { chapter: "https://example.com/ch2", sessionId: "A" }), false);

  assert.equal(restoreApplies(null, { chapter: "https://example.com/ch2" }), false);
});

// requested_ordinal only advances when a segment of a later chapter is fetched,
// so this is the unplayed runway. It has to outlast a locked phone, where
// JavaScript is frozen and nothing can re-attach a playlist that ran out.
test("the session keeps several chapters of runway prepared ahead of playback", () => {
  assert.equal(LOOKAHEAD, 4);
  assert.ok(LOOKAHEAD >= 3);
});

test("public URL guard excludes internal IPv4, mapped IPv6 and localhost", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.0.8", "192.0.2.1", "192.88.99.1", "198.51.100.1", "203.0.113.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1"]) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});

test("public URL guard permits Amethyst Writers' public WordPress addresses", () => {
  for (const ip of ["192.0.78.131", "192.0.78.199", "192.0.1.1", "192.0.255.255"]) assert.equal(publicAddress(ip), true, ip);
});
