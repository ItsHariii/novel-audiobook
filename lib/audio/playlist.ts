import type { Chapter } from "@/lib/types";
import type { AudioAsset, AudioPart, SessionChapter } from "./types";

export interface ReadyChapter { ordinal: number; assetId: string; start: number; duration: number; durations: number[] }
type TimedAsset = { id: string; chunk_count: number; audio_chunks: Array<{ chunk_index: number; duration: number }> };

// The leading run of fully synthesized chapters and their place on the session
// timeline. Needs only chunk counts and durations, never the chapter text.
export function readyTimeline(rows: Array<{ ordinal: number; asset: TimedAsset }>): ReadyChapter[] {
  let start = 0;
  const ready: ReadyChapter[] = [];
  for (const { ordinal, asset } of rows) {
    if (ordinal !== ready.length || asset.audio_chunks.length !== asset.chunk_count) break;
    const chunks = asset.audio_chunks.toSorted((a, b) => a.chunk_index - b.chunk_index);
    if (chunks.some((c, i) => c.chunk_index !== i)) break;
    const duration = chunks.reduce((sum, c) => sum + c.duration, 0);
    ready.push({ ordinal, assetId: asset.id, start, duration, durations: chunks.map((c) => c.duration) });
    start += duration;
  }
  return ready;
}

export function withText(ready: ReadyChapter, chapter: Chapter, chunks: string[]): SessionChapter {
  return { ordinal: ready.ordinal, assetId: ready.assetId, chapter, start: ready.start, duration: ready.duration,
    chunks: chunks.map((text, i) => ({ index: i, text, estDuration: ready.durations[i] })) };
}

export function readyChapters(rows: Array<{ ordinal: number; asset: AudioAsset }>): SessionChapter[] {
  const assets = new Map(rows.map((r) => [r.ordinal, r.asset]));
  return readyTimeline(rows.map(({ ordinal, asset }) => ({ ordinal, asset: { ...asset, chunk_count: asset.chunks.length } })))
    .map((ready) => withText(ready, assets.get(ready.ordinal)!.chapter, assets.get(ready.ordinal)!.chunks));
}

// Closed playlist over every chapter prepared so far. #EXT-X-ENDLIST is always
// present (even while later chapters are still preparing) so iOS treats the
// stream as finite: real duration on the lock screen, no re-download of the
// whole playlist every few seconds. Newly prepared chapters are picked up by
// re-attaching at the end of this playlist, not by growing it underneath the
// player.
//
// No #EXT-X-DISCONTINUITY: the media route rewrites each segment's ID3
// timestamp onto a session-absolute timeline, and every TTS chunk shares the
// same encoding (24 kHz / 48 kbps / mono MPEG-2 Layer III), so AVPlayer can
// keep one decoder across chunk boundaries. Declaring PLAYLIST-TYPE:VOD is
// avoided because the playlist does grow between loads as chapters finish.
export function eventPlaylist(chapters: Array<{ ordinal: number }>, rows: Array<{ ordinal: number; asset: { audio_chunks: Array<{ chunk_index: number; parts?: AudioPart[] }> } }>, sessionId: string, token: string, stopAt = Infinity) {
  const body: string[] = [];
  let elapsed = 0;
  let longest = 0;
  audio: for (const chapter of chapters) {
    const asset = rows.find((r) => r.ordinal === chapter.ordinal)!.asset;
    for (const chunk of asset.audio_chunks.toSorted((a, b) => a.chunk_index - b.chunk_index)) {
      if (elapsed >= stopAt - 0.001) break audio;
      for (const [index, part] of (chunk.parts ?? []).entries()) {
        if (elapsed >= stopAt - 0.001) break audio;
        body.push(`#EXTINF:${part.duration.toFixed(6)},`, `/api/playback-sessions/${sessionId}/media?chapter=${chapter.ordinal}&chunk=${chunk.chunk_index}&part=${index}&token=${encodeURIComponent(token)}`);
        elapsed += part.duration;
        longest = Math.max(longest, part.duration);
      }
    }
  }
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${Math.max(1, Math.ceil(longest))}`, "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-START:TIME-OFFSET=0,PRECISE=YES", ...body, "#EXT-X-ENDLIST"];
  return lines.join("\n") + "\n";
}
