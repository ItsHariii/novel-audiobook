"use client";

import { useEffect, useRef, useState } from "react";
import { authorizedFetch } from "@/lib/supabase/browser";
import { bookKey, type ChapterProgress } from "@/lib/library/types";
import {
  cleanBookTitle,
  isPlaceholderTitle,
  titleFromUrl,
} from "@/lib/library/title";
import type { HistoryItem } from "@/components/player/types";

const FAIL_KEY = "nab:titlefix";
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 2;
const SPACING_MS = 250;
const RETRY_BASE_MS = 60 * 60 * 1000; // 1h, doubles per attempt

type FailMap = Record<string, { attempts: number; retryAfter: number }>;

function readFails(): FailMap {
  try {
    return JSON.parse(localStorage.getItem(FAIL_KEY) ?? "{}") as FailMap;
  } catch {
    return {};
  }
}

function writeFails(map: FailMap) {
  try {
    localStorage.setItem(FAIL_KEY, JSON.stringify(map));
  } catch {
    /* storage full — skip */
  }
}

function needsRepair(item: HistoryItem): boolean {
  if (isPlaceholderTitle(item.bookTitle) && isPlaceholderTitle(item.title)) return true;
  if (item.title === "Saved chapter") return true;
  if (!item.bookTitle && isPlaceholderTitle(item.title)) return true;
  // Numeric / date-derived display titles (maehwasup day groups).
  if (!item.bookTitle && /^\d{1,2}$/.test(item.title.trim())) return true;
  return false;
}

function eligible(item: HistoryItem, fails: FailMap, now: number): boolean {
  if (!needsRepair(item)) return false;
  const fail = fails[item.url];
  if (!fail) return true;
  if (fail.attempts >= MAX_ATTEMPTS) return false;
  return fail.retryAfter <= now;
}

export function useTitleRepair(opts: {
  enabled: boolean;
  hydrated: boolean;
  entries: HistoryItem[];
  restore: (url: string) => ChapterProgress | undefined;
  capture: (p: ChapterProgress, modifiedAt?: number) => void;
  flush: () => Promise<void>;
}): { status: string | null } {
  const [status, setStatus] = useState<string | null>(null);
  const running = useRef(false);
  const doneUrls = useRef(new Set<string>());

  const { enabled, hydrated, entries, restore, capture, flush } = opts;

  useEffect(() => {
    if (!enabled || !hydrated || running.current) return;
    const fails = readFails();
    const now = Date.now();
    const queue = entries.filter(
      (e) => !doneUrls.current.has(e.url) && eligible(e, fails, now),
    );
    if (queue.length === 0) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    running.current = true;
    const total = queue.length;
    let completed = 0;

    const markFail = (url: string) => {
      const prev = fails[url] ?? { attempts: 0, retryAfter: 0 };
      const attempts = prev.attempts + 1;
      fails[url] = {
        attempts,
        retryAfter: Date.now() + RETRY_BASE_MS * Math.pow(2, attempts - 1),
      };
      writeFails(fails);
    };

    const markOk = (url: string) => {
      if (fails[url]) {
        delete fails[url];
        writeFails(fails);
      }
      doneUrls.current.add(url);
    };

    const repairOne = async (item: HistoryItem) => {
      try {
        const res = await authorizedFetch(
          `/api/chapter-title?url=${encodeURIComponent(item.url)}`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          title?: string;
          bookTitle?: string;
          chapterLabel?: string;
          source?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          markFail(item.url);
          return;
        }

        const bookTitle =
          (data.bookTitle && !isPlaceholderTitle(data.bookTitle)
            ? cleanBookTitle(data.bookTitle)
            : undefined) ||
          (data.title && !isPlaceholderTitle(data.title)
            ? cleanBookTitle(data.title)
            : undefined) ||
          titleFromUrl(item.url) ||
          undefined;

        const chapterLabel = data.chapterLabel || item.chapterLabel;
        const title = bookTitle || data.title || item.title;
        const source = data.source || item.source;

        const existing = restore(item.url);
        const base: ChapterProgress = existing ?? {
          chapterUrl: item.url,
          bookKey: item.bookId || bookKey({ url: item.url, source, bookTitle }),
          title: item.title,
          bookTitle: item.bookTitle,
          chapterLabel: item.chapterLabel,
          source: item.source,
          mode: item.mode ?? "audio",
          audioTime: item.audioTime ?? 0,
          voice: "en-US-AvaNeural",
          readerChunk: 0,
          readerOffset: 0,
          wordIndex: 0,
        };

        const patched: ChapterProgress = {
          ...base,
          title,
          bookTitle,
          chapterLabel,
          source,
          bookKey: bookKey({
            url: item.url,
            source,
            bookTitle,
            bookId: undefined,
          }),
        };

        capture(patched, item.lastAt);
        markOk(item.url);
      } catch {
        if (!cancelled) markFail(item.url);
      } finally {
        completed += 1;
        if (!cancelled) {
          setStatus(`Restoring titles… ${completed}/${total}`);
        }
      }
    };

    const run = async () => {
      setStatus(`Restoring titles… 0/${total}`);
      let idx = 0;
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (idx < queue.length && !cancelled) {
          const item = queue[idx++];
          await repairOne(item);
          if (!cancelled) await new Promise((r) => setTimeout(r, SPACING_MS));
        }
      });
      await Promise.all(workers);
      if (!cancelled) {
        await flush();
        setStatus(null);
      }
      running.current = false;
    };

    void run();
    return () => {
      cancelled = true;
      running.current = false;
    };
    // Re-run when the entry set gains new repairable URLs after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hydrated, entries.length]);

  return { status };
}
