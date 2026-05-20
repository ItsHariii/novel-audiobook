import type { CachedSegment } from "./cache";

// Approx characters spoken per second at 1x rate for Edge neural voices.
// 14 c/s is a conservative midpoint across the voices we ship.
const CHARS_PER_SECOND = 14;
const MIN_SEGMENT_SECONDS = 2;

export function estimateDuration(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return MIN_SEGMENT_SECONDS;
  const est = trimmed.length / CHARS_PER_SECOND;
  return Math.max(MIN_SEGMENT_SECONDS, Math.round(est * 10) / 10);
}

export interface PlaylistChapter {
  url: string;
  segments: CachedSegment[];
}

export function buildPlaylist(chapters: PlaylistChapter[], voice: string): string {
  // Compute targetduration across all chapters so HLS spec stays satisfied
  // even when we chain multiple chapters with #EXT-X-DISCONTINUITY between
  // them (used to keep audio flowing when the PWA is backgrounded and JS
  // can't load the next chapter on `ended`).
  const maxSegSec = chapters.reduce((max, ch) => {
    for (const s of ch.segments) if (s.estDuration > max) max = s.estDuration;
    return max;
  }, 0);
  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
    `#EXT-X-TARGETDURATION:${Math.max(4, Math.ceil(maxSegSec))}`,
  ];
  const v = encodeURIComponent(voice);
  chapters.forEach((ch, idx) => {
    if (idx > 0) lines.push("#EXT-X-DISCONTINUITY");
    const u = encodeURIComponent(ch.url);
    ch.segments.forEach((segment, i) => {
      lines.push(`#EXTINF:${segment.estDuration.toFixed(3)},`);
      lines.push(`/api/tts-segment?url=${u}&i=${i}&voice=${v}`);
    });
  });
  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}
