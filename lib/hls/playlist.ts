import type { CachedSegment } from "./cache";

// Characters spoken per second at 1x rate, measured per Edge neural voice.
// Only a fallback: real durations replace these once a segment is synthesized.
const CHARS_PER_SECOND: Record<string, number> = {
  "en-US-AvaNeural": 16,
  "en-US-AndrewNeural": 16.5,
  "en-US-EmmaNeural": 16.1,
  "en-US-BrianNeural": 15.6,
  "en-GB-SoniaNeural": 15.4,
  "en-GB-RyanNeural": 14.1,
  "en-US-GuyNeural": 14.2,
  "en-US-JennyNeural": 14.1,
};
const DEFAULT_CHARS_PER_SECOND = 15;
const MIN_SEGMENT_SECONDS = 2;

export function estimateDuration(text: string, voice?: string): number {
  const trimmed = text.trim();
  if (!trimmed) return MIN_SEGMENT_SECONDS;
  const rate = (voice && CHARS_PER_SECOND[voice]) || DEFAULT_CHARS_PER_SECOND;
  const est = trimmed.length / rate;
  return Math.max(MIN_SEGMENT_SECONDS, Math.round(est * 10) / 10);
}

export function segmentDuration(segment: CachedSegment): number {
  return segment.realDuration ?? segment.estDuration;
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
    for (const s of ch.segments) max = Math.max(max, segmentDuration(s));
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
      lines.push(`#EXTINF:${segmentDuration(segment).toFixed(3)},`);
      lines.push(`/api/tts-segment?url=${u}&i=${i}&voice=${v}`);
    });
  });
  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}
