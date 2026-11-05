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

export type TailState = "idle" | "loading" | "error";

/**
 * The chapter that was opened, followed by the chapters appended below it as
 * the reader scrolls on. Opening another URL starts a fresh strip.
 */
export function useComic(url: string | null) {
  const [loaded, setLoaded] = useState<{ url: string; chapter: ComicChapter } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Chapters appended after the opened one, tagged with the URL they follow on from.
  const [more, setMore] = useState<{ entry: string; list: ComicChapter[] }>({ entry: "", list: [] });
  const [tail, setTail] = useState<{ entry: string; state: TailState }>({ entry: "", state: "idle" });
  const ahead = useRef(new Map<string, Promise<ComicChapter>>());
  const urlRef = useRef(url);
  urlRef.current = url;
  const extending = useRef<string | null>(null);

  useEffect(() => {
    extending.current = null;
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

  const chapter = loaded && loaded.url === url ? loaded.chapter : null;
  const list = more.entry === url ? more.list : [];
  const chapters = chapter ? [chapter, ...list] : null;
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;

  /** Append the chapter after the last one in the strip, once. */
  const extend = useCallback(() => {
    const entry = urlRef.current;
    const strip = chaptersRef.current;
    const next = strip?.[strip.length - 1]?.nextUrl;
    if (!entry || !strip || !next || extending.current === next) return;
    // A source whose "next" loops back would otherwise append forever.
    if (strip.some((c) => c.url === next)) return;
    extending.current = next;
    setTail({ entry, state: "loading" });
    prefetch(next);
    ahead.current.get(next)!.then(
      (c) => {
        ahead.current.delete(next);
        if (urlRef.current !== entry) return;
        extending.current = null;
        setMore((m) => {
          const prev = m.entry === entry ? m.list : [];
          return prev.some((p) => p.url === c.url) ? m : { entry, list: [...prev, c] };
        });
        setTail({ entry, state: "idle" });
      },
      () => {
        if (urlRef.current !== entry) return;
        extending.current = null;
        setTail({ entry, state: "error" });
      },
    );
  }, [prefetch]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { chapter, chapters, loading, error, retry, prefetch, extend, tail: tail.entry === url ? tail.state : "idle" as TailState };
}
