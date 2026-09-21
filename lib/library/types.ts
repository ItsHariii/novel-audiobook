import type { Chapter } from "@/lib/types";
import type { ViewMode } from "@/components/player/types";
import { meaningfulPathParent, normalizeBookTitle } from "./title";

export interface ChapterProgress {
  chapterUrl: string;
  bookKey: string;
  title: string;
  bookTitle?: string;
  chapterLabel?: string;
  source: string;
  mode: ViewMode;
  audioTime: number;
  voice: string;
  readerChunk: number;
  readerOffset: number;
  // Retained for the stored payload shape; the speed reader that used it is gone.
  wordIndex: number;
  coverUrl?: string;
}

export interface ProgressRecord {
  chapter_url: string;
  book_key: string;
  payload: ChapterProgress;
  revision: number;
  updated_at: string;
}

export interface Book {
  book_key: string;
  title: string;
  source: string;
  latest_url: string;
  updated_at: string;
}

export function bookKey(chapter: Pick<Chapter, "url" | "source" | "bookTitle" | "bookId">): string {
  if (chapter.bookId) return chapter.bookId;
  const url = new URL(chapter.url);
  const parent = meaningfulPathParent(url.pathname);
  if (parent) {
    return `${url.origin}/${parent}`;
  }
  if (chapter.bookTitle) {
    const norm = normalizeBookTitle(chapter.bookTitle);
    if (norm) return `${url.origin}::${norm}`;
    return `${url.origin}::${chapter.bookTitle.trim().toLowerCase()}`;
  }
  // Unknown identity must not merge unrelated books under /chapter/.
  return `${url.origin}${url.pathname}`;
}
