import type { Chapter } from "@/lib/types";

export interface AudioPart { path: string; duration: number }
export interface AudioChunk { chunk_index: number; duration: number; bytes: number; parts: AudioPart[] }
export interface AudioAsset {
  id: string;
  generation: string;
  user_id: string;
  chapter: Chapter;
  voice: string;
  chunks: string[];
  bytes: number;
  audio_chunks: AudioChunk[];
}
export interface SessionChapter {
  ordinal: number;
  assetId: string;
  chapter: Chapter;
  chunks: Array<{ index: number; text: string; estDuration: number }>;
  start: number;
  duration: number;
}
export interface PlaybackSession {
  id: string;
  playlistUrl: string;
  voice: string;
  chapters: SessionChapter[];
  preparing: boolean;
  terminal: boolean;
  error: string | null;
}
export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  voice: string;
  requested_ordinal: number;
  expires_at: string;
  terminal: boolean;
  error: string | null;
}

export function chapterAtTime(chapters: SessionChapter[], time: number) {
  return chapters.find((c) => time >= c.start && time < c.start + c.duration)
    ?? (time >= (chapters.at(-1)?.start ?? Infinity) ? chapters.at(-1) : chapters[0]);
}
