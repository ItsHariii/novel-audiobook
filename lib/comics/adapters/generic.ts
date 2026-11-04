import * as cheerio from "cheerio";
import { extractTitles, findNavLinks } from "@/lib/adapters/util";
import { meaningfulPathParent } from "@/lib/library/title";
import type { ComicChapter, ComicPage } from "../types";

const READER_SELECTORS = [
  "#readerarea img",
  ".reading-content img",
  ".wp-manga-chapter-img",
  ".chapter-content img",
  ".reader-area img",
  ".page-break img",
  "#chapter-images img",
  ".container-chapter-reader img",
];
const SKIP_RE = /(?:^|[\/_\-.])(logo|favicon|icon|avatar|banner|ads?|sprite|loading|placeholder|discord|patreon)(?:[\/_\-.]|\d|$)/i;

function imgSrc(el: cheerio.Cheerio<never>): string {
  const raw = el.attr("data-src") || el.attr("data-lazy-src") || el.attr("data-original") || el.attr("src") || "";
  return raw.trim();
}

function collect($: cheerio.CheerioAPI, selector: string, base: URL): ComicPage[] {
  const seen = new Set<string>();
  const out: ComicPage[] = [];
  $(selector).each((_, node) => {
    const el = $(node) as unknown as cheerio.Cheerio<never>;
    const src = imgSrc(el);
    if (!src || src.startsWith("data:")) return;
    let abs: URL;
    try { abs = new URL(src, base); } catch { return; }
    if (!/^https?:$/.test(abs.protocol) || SKIP_RE.test(abs.pathname) || /\.(svg|gif|ico)$/i.test(abs.pathname)) return;
    const key = abs.toString();
    if (seen.has(key)) return;
    seen.add(key);
    const width = Number(el.attr("width"));
    const height = Number(el.attr("height"));
    out.push({ url: key, width: width > 0 ? width : undefined, height: height > 0 ? height : undefined });
  });
  return out;
}

/** Biggest run of images sharing one folder: what a chapter's pages look like. */
function largestCluster(pages: ComicPage[]): ComicPage[] {
  const groups = new Map<string, ComicPage[]>();
  for (const p of pages) {
    const u = new URL(p.url);
    const dir = `${u.host}${u.pathname.slice(0, u.pathname.lastIndexOf("/"))}`;
    groups.set(dir, [...(groups.get(dir) ?? []), p]);
  }
  let best: ComicPage[] = [];
  for (const g of groups.values()) if (g.length > best.length) best = g;
  return best.length >= 3 ? best : [];
}

/** Scan sites built on the common WordPress/Madara-style readers. */
export function parseGenericComic(html: string, pageUrl: string): ComicChapter {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  let pages: ComicPage[] = [];
  for (const sel of READER_SELECTORS) {
    pages = collect($, sel, base);
    if (pages.length >= 2) break;
  }
  if (pages.length < 2) pages = largestCluster(collect($, "img", base));

  const { title, bookTitle, chapterLabel } = extractTitles($, pageUrl);
  const { nextUrl, prevUrl } = findNavLinks($, pageUrl);
  const parent = meaningfulPathParent(base.pathname);
  const number = Number((chapterLabel || "").match(/(\d+(?:\.\d+)?)/)?.[1]);
  const cover = $('meta[property="og:image"]').attr("content");

  return {
    kind: "comic",
    url: pageUrl,
    bookId: parent ? `${base.origin}/${parent}` : `${base.origin}${base.pathname}`,
    bookTitle: bookTitle || title,
    chapterLabel: chapterLabel || title,
    chapterNumber: Number.isFinite(number) && number > 0 ? number : undefined,
    pages,
    nextUrl,
    prevUrl,
    source: base.hostname.replace(/^www\./, ""),
    coverUrl: cover && /^https?:\/\//.test(cover) ? cover : undefined,
  };
}
