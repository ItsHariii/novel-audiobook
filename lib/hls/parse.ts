import { Agent, fetch as undiciFetch } from "undici";
import { pickAdapter, pickCustomFetcher } from "@/lib/adapters";
import type { Chapter } from "@/lib/types";
import { chunkParagraphs } from "@/lib/chunk";
import { cacheKey, getCached, setCached, type CachedChapter } from "./cache";
import { estimateDuration } from "./playlist";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const h2Dispatcher = new Agent({ allowH2: true });

export class ChapterFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchChapterHtml(url: URL): Promise<string> {
  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(url.toString(), {
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
  if (!res.ok) {
    throw new ChapterFetchError(`Upstream returned ${res.status}`, 502);
  }
  return res.text();
}

export async function loadChapter(
  chapterUrl: string,
  voice: string,
): Promise<{ key: string; cached: CachedChapter }> {
  const key = cacheKey(chapterUrl, voice);
  const existing = getCached(key);
  if (existing) return { key, cached: existing };

  let target: URL;
  try {
    target = new URL(chapterUrl);
  } catch {
    throw new ChapterFetchError("Invalid url", 400);
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new ChapterFetchError("Only http(s) URLs are allowed", 400);
  }

  let chapter: Chapter;
  const customFetcher = pickCustomFetcher(target.toString());
  if (customFetcher) {
    try {
      chapter = await customFetcher(target.toString());
    } catch (err) {
      throw new ChapterFetchError(`Fetch failed: ${(err as Error).message}`, 502);
    }
  } else {
    const html = await fetchChapterHtml(target);
    const adapter = pickAdapter(target.toString());
    chapter = adapter(html, target.toString());
  }
  if (chapter.paragraphs.length === 0) {
    throw new ChapterFetchError("Could not find chapter content on the page", 422);
  }
  const chunks = chunkParagraphs(chapter.paragraphs);
  const segments = chunks.map((text) => ({
    text,
    estDuration: estimateDuration(text),
  }));
  const cached = setCached(key, { chapter, voice, segments });
  return { key, cached };
}
