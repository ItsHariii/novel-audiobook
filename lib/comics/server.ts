import "server-only";
import { safeFetch } from "@/lib/http/safeFetch";
import { publicUrl } from "@/lib/hls/public-url";
import { HttpError } from "@/lib/supabase/server";
import { coverProxyPath, coverSecret } from "@/lib/covers/resolve";
import { signCoverUrl, verifyCoverUrl } from "@/lib/covers/extract";
import { hotlinkAllowed, pickComicAdapter } from "./adapters";
import type { ComicChapter } from "./types";

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 64;
const shared = globalThis as typeof globalThis & { __nabComicCache?: Map<string, { chapter: ComicChapter; expiresAt: number }> };
const cache = (shared.__nabComicCache ??= new Map());

const imagePayload = (src: string, ref: string) => `comic\n${src}\n${ref}`;

/** Proxy path for a page image whose host may refuse other sites' referers. */
export function comicImagePath(src: string, ref: string, secret = coverSecret()): string {
  return `/api/comic-image?src=${encodeURIComponent(src)}&ref=${encodeURIComponent(ref)}&sig=${signCoverUrl(imagePayload(src, ref), secret)}`;
}

export function verifyComicImage(src: string, ref: string, sig: string, secret = coverSecret()): boolean {
  return verifyCoverUrl(imagePayload(src, ref), sig, secret);
}

/** Fetch and parse one comic chapter; image URLs come back ready for `<img src>`. */
export async function loadComic(raw: string): Promise<ComicChapter> {
  let target: URL;
  try { target = new URL(raw); } catch { throw new HttpError(400, "That doesn't look like a link."); }
  if (!/^https?:$/.test(target.protocol)) throw new HttpError(400, "Only http(s) links are supported.");
  const key = target.toString();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.chapter;

  await publicUrl(target);
  let html: string;
  try {
    const res = await safeFetch(target, { timeoutMs: 10_000 });
    if (!res.ok) { await res.body?.cancel(); throw new HttpError(502, `The site answered ${res.status}.`); }
    html = await res.text();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, `Couldn't reach the site: ${(e as Error).message}`);
  }
  let chapter: ComicChapter;
  try {
    chapter = pickComicAdapter(key)(html, key);
  } catch (e) {
    throw new HttpError(422, (e as Error).message || "Couldn't read this chapter.");
  }
  if (chapter.pages.length === 0) throw new HttpError(422, "No comic pages found on that page.");

  if (!hotlinkAllowed(key)) {
    const ref = `${target.origin}/`;
    const secret = coverSecret();
    chapter = {
      ...chapter,
      pages: chapter.pages.map((p) => ({ ...p, url: comicImagePath(p.url, ref, secret) })),
      coverUrl: chapter.coverUrl ? coverProxyPath(chapter.coverUrl, secret) : undefined,
    };
  }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { chapter, expiresAt: Date.now() + TTL_MS });
  return chapter;
}
