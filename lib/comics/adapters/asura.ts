import * as cheerio from "cheerio";
import type { ComicChapter, ComicChapterRef, ComicPage } from "../types";

/**
 * Astro serializes island props as `[type, value]` pairs: 0 = plain value
 * (objects hold further pairs), 1 = array of pairs. Other tags (dates, maps,
 * URLs…) are not used by the reader and come back as their raw value.
 */
export function decodeAstroProps(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const [tag, inner] = value as [number, unknown];
  if (tag === 1 && Array.isArray(inner)) return inner.map(decodeAstroProps);
  if (tag === 0 && inner && typeof inner === "object" && !Array.isArray(inner)) {
    return Object.fromEntries(Object.entries(inner).map(([k, v]) => [k, decodeAstroProps(v)]));
  }
  return inner;
}

interface AsuraRef { number?: number; slug?: string }
interface AsuraProps {
  seriesSlug?: string;
  seriesName?: string;
  seriesCover?: string;
  chapterName?: string;
  chapterNumber?: number;
  chapterTitle?: string;
  pages?: Array<{ url?: string; width?: number; height?: number }>;
  prevChapter?: AsuraRef | null;
  nextChapter?: AsuraRef | null;
  chapterList?: AsuraRef[];
  isLocked?: boolean;
}

function readerProps($: cheerio.CheerioAPI): AsuraProps | null {
  let found: AsuraProps | null = null;
  $("astro-island").each((_, el) => {
    if (found) return;
    const raw = $(el).attr("props");
    if (!raw || !raw.includes('"pages"')) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      found = decodeAstroProps([0, parsed]) as AsuraProps;
    } catch { /* not the reader island */ }
  });
  return found;
}

const positive = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined);

function chapterLabel(name: string | undefined, number: number | undefined, title: string | undefined): string {
  const base = `Chapter ${name || number || ""}`.trim();
  return title ? `${base} - ${title}` : base;
}

export function parseAsura(html: string, pageUrl: string): ComicChapter {
  const $ = cheerio.load(html);
  const url = new URL(pageUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  // /comics/<series>/chapter/<n>
  const seriesSlug = parts[0] === "comics" && parts[1] ? parts[1] : undefined;
  const props = readerProps($);
  if (props?.isLocked) throw new Error("This chapter is locked on the source site");

  const slug = props?.seriesSlug || seriesSlug;
  const chapterUrl = (n: number | undefined) => (slug && n !== undefined ? `${url.origin}/comics/${slug}/chapter/${n}` : null);

  let pages: ComicPage[] = (props?.pages ?? [])
    .filter((p): p is { url: string; width?: number; height?: number } => typeof p?.url === "string" && /^https?:\/\//.test(p.url))
    .map((p) => ({ url: p.url, width: positive(p.width), height: positive(p.height) }));
  if (pages.length === 0) {
    const seen = new Set<string>();
    $("img").each((_, el) => {
      const src = $(el).attr("data-src") || $(el).attr("src") || "";
      if (!src.includes("/chapters/")) return;
      try {
        const abs = new URL(src, url).toString();
        if (seen.has(abs)) return;
        seen.add(abs);
        pages.push({ url: abs, width: positive(Number($(el).attr("width"))), height: positive(Number($(el).attr("height"))) });
      } catch { /* skip */ }
    });
  }

  const number = positive(props?.chapterNumber) ?? positive(Number(parts[3]));
  const navHref = (n: number | undefined) => {
    if (n === undefined) return null;
    const a = $(`a[href$="/chapter/${n}"]`).first().attr("href");
    return a ? new URL(a, url).toString() : null;
  };
  const prevNum = props?.prevChapter?.number;
  const nextNum = props?.nextChapter?.number;
  const prevUrl = props ? (prevNum !== undefined ? chapterUrl(prevNum) : null) : navHref(number !== undefined ? number - 1 : undefined);
  const nextUrl = props ? (nextNum !== undefined ? chapterUrl(nextNum) : null) : navHref(number !== undefined ? number + 1 : undefined);

  const docTitle = $("title").text().replace(/\s+/g, " ").trim();
  const bookTitle = props?.seriesName?.trim() || docTitle.split(/\s+Chapter\s+\d/i)[0]?.trim() || slug || "Untitled comic";
  const coverUrl = props?.seriesCover || $('meta[property="og:image"]').attr("content") || undefined;

  const chapters: ComicChapterRef[] = [];
  for (const ref of props?.chapterList ?? []) {
    const n = ref?.number;
    const href = chapterUrl(typeof n === "number" ? n : undefined);
    if (href) chapters.push({ url: href, label: `Chapter ${n}`, number: n });
  }

  return {
    kind: "comic",
    url: pageUrl,
    bookId: slug ? `${url.origin}/comics/${slug}` : `${url.origin}${url.pathname}`,
    bookTitle,
    chapterLabel: chapterLabel(props?.chapterName, number, props?.chapterTitle?.trim() || undefined),
    chapterNumber: number,
    pages,
    prevUrl,
    nextUrl,
    source: url.hostname.replace(/^www\./, ""),
    coverUrl: coverUrl && /^https?:\/\//.test(coverUrl) ? coverUrl : undefined,
    chapters: chapters.length > 0 ? chapters : undefined,
  };
}
