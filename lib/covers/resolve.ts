import "server-only";
import { randomBytes } from "node:crypto";
import { safeFetch } from "@/lib/http/safeFetch";
import { anilistCover, coverCandidates, pickCover, seriesPages, signCoverUrl, siteImage, type AniListMedia } from "./extract";

const HIT_TTL = 24 * 60 * 60 * 1000;
const MISS_TTL = 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const found = new Map<string, { value: string | null; at: number }>();
const siteImages = new Map<string, { value: string | null; at: number }>();

function remember<T>(map: Map<string, { value: T; at: number }>, key: string, value: T) {
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value!);
  map.set(key, { value, at: Date.now() });
}

function recall<T>(map: Map<string, { value: T | null; at: number }>, key: string): { value: T | null } | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > (hit.value ? HIT_TTL : MISS_TTL)) {
    map.delete(key);
    return null;
  }
  return hit;
}

async function page(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(new URL(url), { timeoutMs: 6000 });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      await res.body?.cancel();
      return null;
    }
    return await res.text();
  } catch {
    return null;
  }
}

async function siteWideImage(origin: string): Promise<string | null> {
  const cached = recall(siteImages, origin);
  if (cached) return cached.value;
  const html = await page(`${origin}/`);
  const value = html ? siteImage(html, `${origin}/`) : null;
  remember(siteImages, origin, value);
  return value;
}

async function fromSource(chapterUrl: string): Promise<string | null> {
  const origin = new URL(chapterUrl).origin;
  const siteWide = await siteWideImage(origin);
  for (const url of [chapterUrl, ...seriesPages(chapterUrl)]) {
    const html = await page(url);
    if (!html) continue;
    const cover = pickCover(coverCandidates(html, url), siteWide);
    if (cover) return cover;
  }
  return null;
}

// Most web novels are only on AniList through their manhwa/manhua adaptation,
// so any MANGA-type entry counts; a NOVEL entry wins when both exist.
const ANILIST_QUERY = `query ($search: String) {
  Page(perPage: 8) {
    media(search: $search, type: MANGA) {
      format
      title { romaji english native userPreferred }
      synonyms
      coverImage { extraLarge large }
    }
  }
}`;

async function fromAniList(bookTitle: string): Promise<string | null> {
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: bookTitle } }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { Page?: { media?: AniListMedia[] } } };
    return anilistCover(data.data?.Page?.media ?? [], bookTitle);
  } catch {
    return null;
  }
}

// Without a configured secret, signatures only last as long as the process;
// covers then fall back to the generated artwork. Kept on globalThis because
// each route may load its own copy of this module.
const shared = globalThis as typeof globalThis & { __tomeCoverSecret?: string };

export function coverSecret(): string {
  return process.env.COVER_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    || (shared.__tomeCoverSecret ??= randomBytes(32).toString("hex"));
}

/** Proxy path for a cover image, signed so the proxy only serves covers we found. */
export function coverProxyPath(src: string, secret: string): string {
  return `/api/cover-image?src=${encodeURIComponent(src)}&sig=${signCoverUrl(src, secret)}`;
}

/**
 * Best cover for a book: the novel's own site first (chapter page, then its
 * series page), then AniList when the title matches exactly.
 */
export async function resolveCover(chapterUrl: string, bookTitle: string | null): Promise<string | null> {
  const key = `${new URL(chapterUrl).origin}::${bookTitle?.toLowerCase() || new URL(chapterUrl).pathname}`;
  const cached = recall(found, key);
  if (cached) return cached.value;
  const value = (await fromSource(chapterUrl)) ?? (bookTitle ? await fromAniList(bookTitle) : null);
  remember(found, key, value);
  return value;
}
