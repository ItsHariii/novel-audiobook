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

export function buildPlaylist(
  segments: CachedSegment[],
  chapterUrl: string,
  voice: string,
): string {
  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
    `#EXT-X-TARGETDURATION:${Math.max(
      4,
      Math.ceil(segments.reduce((max, s) => Math.max(max, s.estDuration), 0)),
    )}`,
  ];
  const u = encodeURIComponent(chapterUrl);
  const v = encodeURIComponent(voice);
  segments.forEach((segment, i) => {
    lines.push(`#EXTINF:${segment.estDuration.toFixed(3)},`);
    lines.push(`/api/tts-segment?url=${u}&i=${i}&voice=${v}`);
  });
  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}
