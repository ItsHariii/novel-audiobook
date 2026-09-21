import { Agent, fetch as undiciFetch } from "undici";
import { pickAdapter, pickCustomFetcher } from "@/lib/adapters";
import type { Chapter } from "@/lib/types";
import { chunkParagraphs } from "@/lib/chunk";
import { cacheKey, getCached, setCached, type CachedChapter } from "./cache";
import { estimateDuration } from "./playlist";
import { publicAddress, publicUrl } from "./public-url";
import { lookup } from "node:dns";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const h2Dispatcher = new Agent({ allowH2: true, connect: {
  lookup(hostname, options, callback) {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, []);
      if (addresses.some((a) => !publicAddress(a.address))) return callback(new Error("Private network address blocked"), []);
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  },
} });

export class ChapterFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchChapterHtml(url: URL, redirects = 0): Promise<string> {
  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    await publicUrl(url);
    res = await undiciFetch(url.toString(), {
      redirect: "manual",
      dispatcher: h2Dispatcher,
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "upgrade-insecure-requests": "1",
      },
    });
  } catch (err) {
    throw new ChapterFetchError(`Fetch failed: ${(err as Error).message}`, 502);
  }
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get("location");
    await res.body?.cancel();
    if (!location || redirects >= 4) throw new ChapterFetchError("Invalid upstream redirect", 502);
    return fetchChapterHtml(new URL(location, url), redirects + 1);
  }
  if (!res.ok) {
    throw new ChapterFetchError(`Upstream returned ${res.status}`, 502);
  }
  return res.text();
}

export type ChapterTitles = Pick<Chapter, "title" | "bookTitle" | "chapterLabel" | "source" | "url">;

async function parseChapter(chapterUrl: string): Promise<Chapter> {
  let target: URL;
  try {
    target = new URL(chapterUrl);
  } catch {
    throw new ChapterFetchError("Invalid url", 400);
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new ChapterFetchError("Only http(s) URLs are allowed", 400);
  }
  await publicUrl(target);

  const customFetcher = pickCustomFetcher(target.toString());
  if (customFetcher) {
    try {
      return await customFetcher(target.toString());
    } catch (err) {
      throw new ChapterFetchError(`Fetch failed: ${(err as Error).message}`, 502);
    }
  }
  const html = await fetchChapterHtml(target);
  const adapter = pickAdapter(target.toString());
  return adapter(html, target.toString());
}

/** Lightweight title fetch — tolerates empty bodies (dead sites still yield titles). */
export async function loadChapterTitles(chapterUrl: string): Promise<ChapterTitles> {
  // Reuse a warm chapter cache entry when present (any voice).
  // cacheKey includes voice, so we still parse when cold.
  const chapter = await parseChapter(chapterUrl);
  return {
    url: chapter.url,
    title: chapter.title,
    bookTitle: chapter.bookTitle,
    chapterLabel: chapter.chapterLabel,
    source: chapter.source,
  };
}

export async function loadChapter(
  chapterUrl: string,
  voice: string,
): Promise<{ key: string; cached: CachedChapter }> {
  const key = cacheKey(chapterUrl, voice);
  const existing = getCached(key);
  if (existing) return { key, cached: existing };

  const chapter = await parseChapter(chapterUrl);
  if (chapter.paragraphs.length === 0) {
    throw new ChapterFetchError("Could not find chapter content on the page", 422);
  }
  const chunks = chunkParagraphs(chapter.paragraphs);
  const segments = chunks.map((text) => ({
    text,
    estDuration: estimateDuration(text, voice),
  }));
  const cached = setCached(key, { chapter, voice, segments });
  return { key, cached };
}
