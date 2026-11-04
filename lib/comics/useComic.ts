"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch } from "@/lib/supabase/browser";
import type { ComicChapter } from "./types";

async function fetchComic(url: string, signal?: AbortSignal): Promise<ComicChapter> {
  const res = await authorizedFetch(`/api/comic?url=${encodeURIComponent(url)}`, { signal });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; chapter?: ComicChapter; error?: string } | null;
  if (!res.ok || !data?.ok || !data.chapter) throw new Error(data?.error || `Couldn't load this chapter (${res.status}).`);
  return data.chapter;
}

/** Warm the browser cache with a chapter's first pages. */
function preloadImages(chapter: ComicChapter, count = 2) {
  for (const p of chapter.pages.slice(0, count)) {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.src = p.url;
  }
}

/** One comic chapter at a time, with the next one fetched ahead of need. */
export function useComic(url: string | null) {
  const [loaded, setLoaded] = useState<{ url: string; chapter: ComicChapter } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ahead = useRef(new Map<string, Promise<ComicChapter>>());

  useEffect(() => {
    if (!url) { setLoaded(null); setError(null); setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const pending = ahead.current.get(url) ?? fetchComic(url, ac.signal);
    ahead.current.delete(url);
    pending.then(
      (c) => { if (!ac.signal.aborted) { setLoaded({ url, chapter: c }); setLoading(false); } },
      (e: Error) => { if (!ac.signal.aborted && e.name !== "AbortError") { setError(e.message); setLoading(false); } },
    );
    return () => ac.abort();
  }, [url, attempt]);

  const prefetch = useCallback((next: string | null) => {
    if (!next || ahead.current.has(next)) return;
    const p = fetchComic(next);
    p.then((c) => preloadImages(c), () => ahead.current.delete(next));
    ahead.current.set(next, p);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { chapter: loaded && loaded.url === url ? loaded.chapter : null, loading, error, retry, prefetch };
}
