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
  const groups = mergeVariants(Array.from(byKey.values()));
  for (const g of groups) {
    g.chapters.sort((a, b) => chapterNumber(a) - chapterNumber(b));
  }
  // Most recently touched book first; tie-break by highest chapter number so
  // all-zero lastAt legacy imports still order sensibly.
  groups.sort((a, b) => b.lastAt - a.lastAt || b.maxChapter - a.maxChapter);
  return groups;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Sites title the same book differently from page to page ("Return of the
 * Mount Hua" vs "Return of the Mount Hua Sect"). Fold groups together when
 * they share a book id, or when they come from the same site and one title is
 * the other plus a few trailing words.
 */
function mergeVariants(groups: BookGroup[]): BookGroup[] {
  const parent = groups.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ids = groups.map((g) => new Set(g.chapters.map((c) => c.bookId).filter(Boolean)));
  const hosts = groups.map((g) => new Set(g.chapters.map((c) => hostOf(c.url))));
  const norms = groups.map((g) => normalizeBookTitle(g.title));
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const sharedId = [...ids[i]].some((id) => ids[j].has(id));
      const sameHost = [...hosts[i]].some((h) => hosts[j].has(h));
      const [short, long] = norms[i].length <= norms[j].length ? [norms[i], norms[j]] : [norms[j], norms[i]];
      // A short, number-free tail ("sect", "novel") is a naming variant; a
      // longer or numbered one ("ragnarok", "2") is more likely a sequel.
      const tail = long.slice(short.length);
      const variant = sameHost && short.length >= 8 && long.startsWith(short) && tail.length <= 6 && !/\d/.test(tail);
      if (sharedId || variant) parent[find(j)] = find(i);
    }
  }
  const merged = new Map<number, BookGroup>();
  groups.forEach((g, i) => {
    const root = find(i);
    const into = merged.get(root);
    if (!into) {
      merged.set(root, { ...g, chapters: [...g.chapters], sources: [...g.sources] });
      return;
    }
    const seen = new Set(into.chapters.map((c) => c.url));
    into.chapters.push(...g.chapters.filter((c) => !seen.has(c.url)));
    for (const src of g.sources) if (!into.sources.includes(src)) into.sources.push(src);
    if (g.lastAt > into.lastAt) {
      into.lastAt = g.lastAt;
      into.latest = g.latest;
    }
    into.maxChapter = Math.max(into.maxChapter, g.maxChapter);
    into.coverUrl = into.coverUrl || g.coverUrl;
    // The fuller title is usually the real one.
    if (!isPlaceholderTitle(g.title) && (isPlaceholderTitle(into.title) || g.title.length > into.title.length)) {
      into.title = g.title;
      into.coverSeed = g.title;
    }
  });
  return [...merged.values()];
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
