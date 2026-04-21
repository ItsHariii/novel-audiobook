import type { Chapter } from "@/lib/types";

export type ChunkStatus = "pending" | "loading" | "ready" | "error";

export interface Chunk {
  index: number;
  text: string;
  blobUrl: string | null;
  status: ChunkStatus;
  error?: string;
}

export interface LoadedChapter {
  chapter: Chapter;
  chunks: Chunk[];
}

export interface HistoryItem {
  url: string;
  title: string;
  source: string;
  coverSeed: string;
  lastAt: number;
}
