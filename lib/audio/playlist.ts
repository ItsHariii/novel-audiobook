import type { AudioAsset, SessionChapter } from "./types";

export function readyChapters(rows: Array<{ ordinal: number; asset: AudioAsset }>): SessionChapter[] {
  let start = 0;
  const chapters: SessionChapter[] = [];
  for (const { ordinal, asset } of rows) {
    if (ordinal !== chapters.length || asset.audio_chunks.length !== asset.chunks.length) break;
    const chunks = asset.audio_chunks.toSorted((a, b) => a.chunk_index - b.chunk_index);
    if (chunks.some((c, i) => c.chunk_index !== i)) break;
    const duration = chunks.reduce((sum, c) => sum + c.duration, 0);
    chapters.push({ ordinal, assetId: asset.id, chapter: asset.chapter, chunks: asset.chunks.map((text, i) => ({ index: i, text, estDuration: chunks[i].duration })), start, duration });
    start += duration;
  }
  return chapters;
}

export function eventPlaylist(chapters: SessionChapter[], rows: Array<{ ordinal: number; asset: AudioAsset }>, sessionId: string, token: string, terminal: boolean, stopAt = Infinity) {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-PLAYLIST-TYPE:EVENT", "#EXT-X-TARGETDURATION:6", "#EXT-X-MEDIA-SEQUENCE:0", "#EXT-X-START:TIME-OFFSET=0,PRECISE=YES"];
  let first = true;
  let elapsed = 0;
  audio: for (const chapter of chapters) {
    const asset = rows.find((r) => r.ordinal === chapter.ordinal)!.asset;
    for (const chunk of asset.audio_chunks.toSorted((a, b) => a.chunk_index - b.chunk_index)) {
      if (elapsed >= stopAt - 0.001) break audio;
      if (!first) lines.push("#EXT-X-DISCONTINUITY");
      first = false;
      for (const [index, part] of chunk.parts.entries()) {
        if (elapsed >= stopAt - 0.001) break audio;
        lines.push(`#EXTINF:${part.duration.toFixed(6)},`, `/api/playback-sessions/${sessionId}/media?chapter=${chapter.ordinal}&chunk=${chunk.chunk_index}&part=${index}&token=${encodeURIComponent(token)}`);
        elapsed += part.duration;
      }
    }
  }
  if (terminal || elapsed >= stopAt - 0.001) lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}
