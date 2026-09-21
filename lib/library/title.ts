const CHAPTER_CLAUSE_RE =
  /\s*[-–—|·:]\s*(?:chapter|ch\.?|ep(?:isode)?)\s*\d+\b.*$/i;
const CHAPTER_INLINE_RE =
  /\s+(?:chapter|ch\.?|ep(?:isode)?)\s*\d+\b.*$/i;
const QUALIFIER_RE =
  /\s*[\(\[]?\s*(?:web\s*novel|light\s*novel|novel\s*mtl|mtl|wn|ln|novel)\s*[\)\]]?\s*$/i;
const PLACEHOLDER_RE =
  /^(?:saved chapter|untitled chapter|novel|untitled|unknown)$/i;
const DATE_SEGMENT_RE = /^(?:19|20)\d{2}$|^(?:0?[1-9]|1[0-2])$|^(?:0?[1-9]|[12]\d|3[01])$/;
const CHAPTER_SEGMENT_RE = /(?:^|[-_])(?:chapter|ch|ep|episode)[-_]?\d+/i;
const NUMERIC_ONLY_RE = /^\d+$/;
const GENERIC_PATH = new Set([
  "novel",
  "novels",
  "book",
  "books",
  "series",
  "manga",
  "read",
  "chapter",
  "chapters",
  "www",
]);

export function cleanBookTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t) return t;
  t = t.replace(CHAPTER_CLAUSE_RE, "").trim();
  t = t.replace(CHAPTER_INLINE_RE, "").trim();
  t = t.replace(QUALIFIER_RE, "").trim();
  // Drop a trailing site-name fragment after a separator when short.
  t = t.replace(/\s+[-–—|·]\s+[A-Za-z0-9.-]{2,40}$/, "").trim();
  return t;
}

export function normalizeBookTitle(t: string): string {
  return cleanBookTitle(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function isPlaceholderTitle(t: string | undefined | null): boolean {
  if (!t) return true;
  const s = t.replace(/\s+/g, " ").trim();
  if (!s) return true;
  if (PLACEHOLDER_RE.test(s)) return true;
  if (NUMERIC_ONLY_RE.test(s)) return true;
  if (DATE_SEGMENT_RE.test(s)) return true;
  if (/^(?:chapter|ch\.?|ep(?:isode)?)\s*\d+\b/i.test(s) && s.length < 40) return true;
  return false;
}

export function titleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const candidates = parts.filter((p) => {
      const lower = p.toLowerCase();
      if (GENERIC_PATH.has(lower)) return false;
      if (DATE_SEGMENT_RE.test(p)) return false;
      if (NUMERIC_ONLY_RE.test(p)) return false;
      if (CHAPTER_SEGMENT_RE.test(p)) return false;
      // Strip chapter tokens from compound slugs and re-check.
      const stripped = p
        .replace(/[-_]?(?:chapter|ch|ep|episode)[-_]?\d+.*$/i, "")
        .replace(/[-_]+$/g, "");
      if (!stripped || NUMERIC_ONLY_RE.test(stripped) || DATE_SEGMENT_RE.test(stripped)) {
        return false;
      }
      return true;
    });
    const slug = candidates[candidates.length - 1];
    if (!slug) return null;
    const cleaned = slug
      .replace(/[-_]?(?:chapter|ch|ep|episode)[-_]?\d+.*$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    if (!cleaned || isPlaceholderTitle(cleaned)) return null;
    return cleaned
      .split(" ")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  } catch {
    return null;
  }
}

export function chapterNumberFromTitle(title: string): number | null {
  const m = title.match(/(?:^|\b)(?:chapter|ch\.?|ep(?:isode)?)\s*(\d+)\b/i)
    ?? title.match(/^\s*(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
}

export function chapterNumberFromUrl(url: string): number | null {
  const m =
    url.match(/chapter[-_]?(\d+)/i) ??
    url.match(/\/(\d+)(?:[/#?]|$)/) ??
    null;
  return m ? parseInt(m[1], 10) : null;
}

export function chapterNumber(item: {
  chapterLabel?: string;
  title: string;
  url: string;
  lastAt?: number;
}): number {
  if (item.chapterLabel) {
    const fromLabel = chapterNumberFromTitle(item.chapterLabel);
    if (fromLabel !== null) return fromLabel;
  }
  const fromTitle = chapterNumberFromTitle(item.title);
  if (fromTitle !== null) return fromTitle;
  const fromUrl = chapterNumberFromUrl(item.url);
  if (fromUrl !== null) return fromUrl;
  return (item.lastAt ?? 0) / 1000;
}

/** Path segments that are useful for book identity (drop dates, chapter nums). */
export function meaningfulPathParent(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const parentParts = parts.slice(0, -1).filter((p) => {
    const lower = p.toLowerCase();
    if (GENERIC_PATH.has(lower)) return false;
    if (DATE_SEGMENT_RE.test(p)) return false;
    if (NUMERIC_ONLY_RE.test(p)) return false;
    if (CHAPTER_SEGMENT_RE.test(p)) return false;
    return true;
  });
  if (parentParts.length === 0) return null;
  return parentParts.join("/");
}
