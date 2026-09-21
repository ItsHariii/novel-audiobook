import * as cheerio from "cheerio";
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeBookTitle } from "@/lib/library/title";

const LOGO_RE = /(?:^|[\/_\-.])(logo|favicon|icon|avatar|banner|default|placeholder|site[-_]?image|header)(?:[\/_\-.]|\d|$)/i;
const BAD_EXT_RE = /\.(svg|ico|gif)(?:$|[?#])/i;

const COVER_SELECTORS = [
  ".novel-cover img",
  ".book-cover img",
  ".cover img",
  ".summary_image img",
  ".series-thumb img",
  ".thumb img",
  "img.cover",
  "img[alt*='cover' i]",
  "img[class*='cover' i]",
];

function absolute(src: string | undefined, base: string): string | null {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;
  try {
    const url = new URL(trimmed, base);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function jsonLdImages(value: unknown, out: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) jsonLdImages(v, out);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["image", "thumbnailUrl"]) {
    const v = record[key];
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => (typeof x === "string" ? out.push(x) : jsonLdImages(x, out)));
    else if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") out.push((v as { url: string }).url);
  }
  if (record["@graph"]) jsonLdImages(record["@graph"], out);
}

/** Candidate cover images on a page, best guess first, as absolute URLs. */
export function coverCandidates(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const raw: string[] = [];
  for (const sel of COVER_SELECTORS) {
    $(sel).each((_, el) => {
      const img = $(el);
      raw.push(img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "");
    });
  }
  $("script[type='application/ld+json']").each((_, el) => {
    try { jsonLdImages(JSON.parse($(el).text()), raw); } catch {}
  });
  raw.push(
    $('meta[property="og:image"]').attr("content") || "",
    $('meta[property="og:image:url"]').attr("content") || "",
    $('meta[name="twitter:image"]').attr("content") || "",
    $('link[rel="image_src"]').attr("href") || "",
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const abs = absolute(r, pageUrl);
    if (abs && !seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  return out;
}

/** The site-wide share image: what the home page advertises for itself. */
export function siteImage(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  return absolute($('meta[property="og:image"]').attr("content") || $('meta[name="twitter:image"]').attr("content"), pageUrl);
}

function sameImage(a: string, b: string): boolean {
  const strip = (u: string) => {
    try {
      const url = new URL(u);
      return `${url.hostname}${url.pathname}`.replace(/^i\d\.wp\.com\//, "");
    } catch {
      return u;
    }
  };
  return strip(a) === strip(b);
}

/** First candidate that isn't a logo, an icon format, or the site-wide image. */
export function pickCover(candidates: string[], siteWide: string | null): string | null {
  for (const c of candidates) {
    let path = c;
    try { path = new URL(c).pathname; } catch {}
    if (LOGO_RE.test(path) || BAD_EXT_RE.test(c)) continue;
    if (siteWide && sameImage(c, siteWide)) continue;
    return c;
  }
  return null;
}

/** Likely series-page URLs for a chapter URL, nearest first. */
export function seriesPages(chapterUrl: string): string[] {
  try {
    const url = new URL(chapterUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const out: string[] = [];
    for (let n = parts.length - 1; n >= 1 && out.length < 2; n--) {
      const seg = parts[n - 1].toLowerCase();
      if (/^(chapter|chapters|ch|read|episode|ep|\d+)$/.test(seg)) continue;
      out.push(`${url.origin}/${parts.slice(0, n).join("/")}/`);
    }
    return out;
  } catch {
    return [];
  }
}

export interface AniListMedia {
  format?: string | null;
  title: { romaji?: string | null; english?: string | null; native?: string | null; userPreferred?: string | null };
  synonyms?: string[] | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
}

/** AniList result only counts when one of its titles is the same book. */
export function anilistCover(media: AniListMedia[], bookTitle: string): string | null {
  const want = normalizeBookTitle(bookTitle);
  if (!want) return null;
  const ordered = [...media].sort((a, b) => Number(b.format === "NOVEL") - Number(a.format === "NOVEL"));
  for (const m of ordered) {
    const titles = [m.title.romaji, m.title.english, m.title.native, m.title.userPreferred, ...(m.synonyms ?? [])];
    if (titles.some((t) => t && normalizeBookTitle(t) === want)) {
      return m.coverImage?.extraLarge || m.coverImage?.large || null;
    }
  }
  return null;
}

export function signCoverUrl(src: string, secret: string): string {
  return createHmac("sha256", secret).update(src).digest("base64url");
}

export function verifyCoverUrl(src: string, sig: string, secret: string): boolean {
  const expected = Buffer.from(signCoverUrl(src, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
