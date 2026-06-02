import type { Chapter } from "@/lib/types";

export type ViewMode = "reader" | "rsvp" | "audio";

export interface Chunk {
  index: number;
  text: string;
  estDuration: number;
}

export interface LoadedChapter {
  chapter: Chapter;
  chunks: Chunk[];
  cumDurations: number[];
  totalDuration: number;
  playlistUrl: string;
  voice: string;
}

export interface HistoryItem {
  url: string;
  title: string;
  source: string;
  coverSeed: string;
  lastAt: number;
  bookTitle?: string;
  chapterLabel?: string;
}
