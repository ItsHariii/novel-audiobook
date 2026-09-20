"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch } from "@/lib/supabase/browser";
import type { LoadedChapter } from "@/components/player/types";
import { chapterAtTime, type PlaybackSession, type SessionChapter } from "./types";

export function loadedSessionChapter(session: PlaybackSession, chapter: SessionChapter): LoadedChapter {
  const cumDurations = [0];
  for (const c of chapter.chunks) cumDurations.push(cumDurations.at(-1)! + c.estDuration);
  return { chapter: chapter.chapter, chunks: chapter.chunks, cumDurations, totalDuration: chapter.duration,
    playlistUrl: session.playlistUrl, voice: session.voice, sessionId: session.id, startOffset: chapter.start };
}

export function usePlaybackSession() {
  const sessionRef = useRef<PlaybackSession | null>(null);
  const generationRef = useRef(0);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const existing = sessionRef.current;
    if (!existing) return null;
    const res = await authorizedFetch(`/api/playback-sessions/${existing.id}`, { signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not refresh audio");
    if (existing.id !== sessionRef.current?.id) return null;
    const updated = { ...data, playlistUrl: existing.playlistUrl } as PlaybackSession;
    sessionRef.current = updated;
    setSession(updated);
    setError(updated.error);
    return updated;
  }, []);

  const close = useCallback(async () => {
    const generation = ++generationRef.current;
    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setPreparing(false);
    setError(null);
    if (previous) await authorizedFetch(`/api/playback-sessions/${previous.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close" }) }).catch(() => {});
    return generation;
  }, []);

  const prepare = useCallback(async (url: string, voice: string, signal: AbortSignal) => {
    const generation = await close();
    if (signal.aborted || generation !== generationRef.current) throw new DOMException("Cancelled", "AbortError");
    setPreparing(true); setError(null);
    try {
      const res = await authorizedFetch("/api/playback-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, voice }), signal });
      const data = await res.json();
      if (signal.aborted || generation !== generationRef.current) throw new DOMException("Cancelled", "AbortError");
      if (!res.ok) throw new Error(data.error || "Could not prepare audio");
      const created = data as PlaybackSession;
      sessionRef.current = created; setSession(created);
      while (!signal.aborted && sessionRef.current?.id === created.id) {
        const updated = await refresh(signal);
        if (!updated) throw new DOMException("Cancelled", "AbortError");
        if (updated.chapters.length) return loadedSessionChapter(updated, updated.chapters[0]);
        if (updated.error) throw new Error(updated.error);
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2000);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
      }
      throw new DOMException("Cancelled", "AbortError");
    } catch (error) {
      if (generation === generationRef.current && !signal.aborted) setError(error instanceof Error ? error.message : "Could not prepare audio");
      throw error;
    } finally { if (generation === generationRef.current) setPreparing(false); }
  }, [close, refresh]);

  // Poll regardless of visibility. Background timers are throttled heavily, but
  // a phone that wakes for a moment still needs to notice newly prepared
  // chapters: gating this on `visible` meant a locked device could never pick
  // them up, so playback that ran off the end of the attached playlist stayed
  // dead until the screen came back on.
  useEffect(() => {
    if (!session?.id || preparing) return;
    const sync = () => { void refresh().catch((e) => setError(e.message)); };
    const interval = setInterval(sync, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", sync);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", sync); };
  }, [session?.id, preparing, refresh]);

  const atTime = useCallback((time: number) => {
    const current = sessionRef.current;
    const last = current?.chapters.at(-1);
    if (last && time > last.start + last.duration + 0.25) return undefined;
    const chapter = current && chapterAtTime(current.chapters, time);
    return current && chapter ? loadedSessionChapter(current, chapter) : undefined;
  }, []);

  return { session, preparing, error, prepare, refresh, close, atTime };
}
