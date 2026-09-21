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

/** Book name hidden in a book key's URL ("…/3801994495-return-of-the-mount-hua-sect"). */
export function slugTitle(key: string | undefined): string | null {
  if (!key) return null;
  if (key.includes("::")) return null;
  let segment: string;
  try {
    segment = decodeURIComponent(new URL(key).pathname.split("/").filter(Boolean).at(-1) ?? "");
  } catch {
    return null;
  }
  const words = segment
    .toLowerCase()
    .replace(/\.html?$/, "")
    .replace(/^\d{3,}[-_]/, "")
    .replace(/[-_]\d+$/, "")
    .replace(/[-_](web[-_])?(novel|ln|mtl)([-_](mtl|novel))?$/, "")
    .split(/[-_]+/)
    .filter(Boolean);
  if (words.length < 2) return null;
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** Titles that are really a chapter heading or the site's own name. */
function poorTitle(title: string, hosts: Set<string>): boolean {
  if (isPlaceholderTitle(title)) return true;
  if (/^\s*\d/.test(title) || /\b(chapter|ch\.?|episode)\s*\d/i.test(title)) return true;
  const norm = normalizeBookTitle(title);
  return [...hosts].some((h) => normalizeBookTitle(h.split(".")[0]) === norm);
}

// Trailing words sites add or drop without it being a different book. Anything
// else ("extra", "ragnarok", "2") may be a side story or sequel, so it stays apart.
const VARIANT_TAILS = new Set(["sect", "novel", "webnovel", "wn", "ln", "lightnovel", "mtl"]);

/** Same book when equal, or when one is the other plus a known naming tail ("sect"). */
function sameBook(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 8 && long.startsWith(short) && VARIANT_TAILS.has(long.slice(short.length));
}

/**
 * The same book turns up under different names across sites and pages
 * ("Return of the Mount Hua" on one, "... Sect" on another, a chapter heading
 * saved as the title on a third). Fold groups together when they share a
 * book id, or when any of their names — titles or the book's URL slug — match.
 */
function mergeVariants(groups: BookGroup[]): BookGroup[] {
  const parent = groups.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const hosts = groups.map((g) => new Set(g.chapters.map((c) => hostOf(c.url))));
  const ids = groups.map((g) => new Set(g.chapters.map((c) => c.bookId).filter((id): id is string => !!id)));
  const names = groups.map((g, i) => {
    const out = new Set<string>();
    if (!poorTitle(g.title, hosts[i])) out.add(normalizeBookTitle(g.title));
    for (const id of ids[i]) {
      const slug = slugTitle(id);
      if (slug) out.add(normalizeBookTitle(slug));
    }
    out.delete("");
    return out;
  });
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const sharedId = [...ids[i]].some((id) => ids[j].has(id));
      const sharedName = [...names[i]].some((a) => [...names[j]].some((b) => sameBook(a, b)));
      if (sharedId || sharedName) parent[find(j)] = find(i);
    }
  }
  const merged = new Map<number, { group: BookGroup; hosts: Set<string>; slugs: string[] }>();
  groups.forEach((g, i) => {
    const root = find(i);
    const slugs = [...ids[i]].map(slugTitle).filter((t): t is string => !!t);
    const entry = merged.get(root);
    if (!entry) {
      merged.set(root, { group: { ...g, chapters: [...g.chapters], sources: [...g.sources] }, hosts: new Set(hosts[i]), slugs });
      return;
    }
    const into = entry.group;
    const seen = new Set(into.chapters.map((c) => c.url));
    into.chapters.push(...g.chapters.filter((c) => !seen.has(c.url)));
    for (const src of g.sources) if (!into.sources.includes(src)) into.sources.push(src);
    for (const h of hosts[i]) entry.hosts.add(h);
    entry.slugs.push(...slugs);
    if (g.lastAt > into.lastAt) {
      into.lastAt = g.lastAt;
      into.latest = g.latest;
    }
    into.maxChapter = Math.max(into.maxChapter, g.maxChapter);
    into.coverUrl = into.coverUrl || g.coverUrl;
    // The fuller real title wins over a shorter one or a chapter heading.
    const intoPoor = poorTitle(into.title, entry.hosts);
    if (!poorTitle(g.title, hosts[i]) && (intoPoor || g.title.length > into.title.length)) {
      into.title = g.title;
    }
  });
  return [...merged.values()].map(({ group, hosts: h, slugs }) => {
    if (poorTitle(group.title, h) && slugs.length > 0) group.title = slugs.sort((a, b) => b.length - a.length)[0];
    group.coverSeed = group.title;
    return group;
  });
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
