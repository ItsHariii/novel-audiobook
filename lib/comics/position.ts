export interface ComicPosition {
  /** 0-based page index. */
  page: number;
  /** How far down that page the top of the screen sits, 0–1. */
  offset: number;
}

/** Page under scroll position `y`, given each page's top and height. */
export function locate(tops: number[], heights: number[], y: number): ComicPosition {
  if (tops.length === 0) return { page: 0, offset: 0 };
  let lo = 0;
  let hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  const h = heights[lo] || 1;
  return { page: lo, offset: Math.round(Math.max(0, Math.min(1, (y - tops[lo]) / h)) * 10_000) / 10_000 };
}

/** Scroll position that puts `pos` at the top of the screen. */
export function scrollFor(tops: number[], heights: number[], pos: ComicPosition): number {
  if (tops.length === 0) return 0;
  const page = Math.max(0, Math.min(tops.length - 1, Math.floor(pos.page)));
  return tops[page] + (heights[page] || 0) * Math.max(0, Math.min(1, pos.offset));
}

/** Whole-chapter progress, 0–1. */
export function chapterProgress(pos: ComicPosition, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.max(0, Math.min(1, (pos.page + pos.offset) / pageCount));
}

const LOCAL_PREFIX = "nab:comic:";

export function readLocalPosition(url: string): ComicPosition | null {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_PREFIX + url) || "null") as ComicPosition | null;
    return v && typeof v.page === "number" && typeof v.offset === "number" ? v : null;
  } catch { return null; }
}

export function writeLocalPosition(url: string, pos: ComicPosition) {
  try { localStorage.setItem(LOCAL_PREFIX + url, JSON.stringify(pos)); } catch { /* storage full */ }
}

export function clearLocalPosition(url: string) {
  try { localStorage.removeItem(LOCAL_PREFIX + url); } catch { /* ignore */ }
}
