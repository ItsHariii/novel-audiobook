import type { Chapter } from "@/lib/types";

export type ViewMode = "reader" | "audio";

/** Old saves may still say "rsvp" (speed-reading mode, since removed). */
export function normalizeMode(mode: unknown): ViewMode {
  return mode === "audio" ? "audio" : "reader";
}

export interface Chunk {
  index: number;
  text: string;
  estDuration: number;
}

export interface LoadedChapter {
  audioPending?: boolean;
  sessionId?: string;
  startOffset?: number;
  chapter: Chapter;
  chunks: Chunk[];
  cumDurations: number[];
  totalDuration: number;
  playlistUrl: string;
  voice: string;
}

export interface HistoryItem {
  bookId?: string;
  audioTime?: number;
  mode?: ViewMode;
  url: string;
  title: string;
  source: string;
  coverSeed: string;
  lastAt: number;
  bookTitle?: string;
  chapterLabel?: string;
  coverUrl?: string;
}
