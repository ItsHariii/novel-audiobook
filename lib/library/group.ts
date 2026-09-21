import { bookKey } from "@/lib/library/types";
import {
  chapterNumber,
  chapterNumberFromTitle,
  cleanBookTitle,
  isPlaceholderTitle,
  normalizeBookTitle,
  titleFromUrl,
} from "@/lib/library/title";
import type { HistoryItem } from "@/components/player/types";

export interface BookGroup {
  key: string;
  title: string;
  sources: string[];
  chapters: HistoryItem[];
  lastAt: number;
  maxChapter: number;
  latest: HistoryItem;
  coverSeed: string;
  coverUrl?: string;
}

/** History entries grouped into books, most recently touched first. */
export function groupHistoryByBook(history: HistoryItem[]): BookGroup[] {
  const byKey = new Map<string, BookGroup>();
  for (const item of history) {
    const display = displayBookTitle(item);
    const norm = normalizeBookTitle(display);
    const key = norm || deriveBookKey(item);
    const existing = byKey.get(key);
    const chNum = chapterNumber(item);
    if (existing) {
      existing.chapters.push(item);
      if (!existing.sources.includes(item.source)) existing.sources.push(item.source);
      if (item.lastAt > existing.lastAt) {
        existing.lastAt = item.lastAt;
        existing.latest = item;
      }
      if (chNum > existing.maxChapter) existing.maxChapter = chNum;
      if (!existing.coverUrl && item.coverUrl) existing.coverUrl = item.coverUrl;
      // Prefer a non-placeholder title if a later entry has a better one.
      if (isPlaceholderTitle(existing.title) && !isPlaceholderTitle(display)) {
        existing.title = display;
        existing.coverSeed = display;
      }
    } else {
      byKey.set(key, {
        key,
        title: display,
        sources: [item.source],
        chapters: [item],
        lastAt: item.lastAt,
        maxChapter: chNum,
        latest: item,
        coverSeed: display,
        coverUrl: item.coverUrl,
      });
    }
  }
  const groups = Array.from(byKey.values());
  for (const g of groups) {
    g.chapters.sort((a, b) => chapterNumber(a) - chapterNumber(b));
  }
  // Most recently touched book first; tie-break by highest chapter number so
  // all-zero lastAt legacy imports still order sensibly.
  groups.sort((a, b) => b.lastAt - a.lastAt || b.maxChapter - a.maxChapter);
  return groups;
}

function deriveBookKey(item: HistoryItem): string {
  try {
    return bookKey(item);
  } catch {
    return item.source + "::" + (item.bookTitle || item.title);
  }
}

export function displayBookTitle(item: HistoryItem): string {
  if (item.bookTitle && !isPlaceholderTitle(item.bookTitle)) {
    return cleanBookTitle(item.bookTitle);
  }
  if (item.title && !isPlaceholderTitle(item.title)) {
    const cleaned = cleanBookTitle(item.title);
    if (cleaned && !isPlaceholderTitle(cleaned)) return cleaned;
  }
  const fromUrl = titleFromUrl(item.url);
  if (fromUrl) return fromUrl;
  return item.source;
}

/** "Chapter 12 - The Road" → { badge: "12", label: "The Road" }. */
export function splitChapterTitle(title: string): { badge: string | null; label: string } {
  const num = chapterNumberFromTitle(title);
  if (num === null) return { badge: null, label: title };
  const stripped = title
    .replace(/^\s*(?:chapter|ch\.?|ep(?:isode)?)?\s*\d+\s*[—–\-:·•]*\s*/i, "")
    .trim();
  return {
    badge: String(num),
    label: stripped.length > 0 ? stripped : title,
  };
}

/** Short label for a chapter: "Ch. 12" when numbered, else its title. */
export function shortChapter(item: Pick<HistoryItem, "chapterLabel" | "title">): string {
  const { badge, label } = splitChapterTitle(item.chapterLabel || item.title);
  return badge ? `Ch. ${badge}` : label;
}

export function formatClock(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "0:00";
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
