"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "@/lib/types";
import { chunkParagraphs } from "@/lib/chunk";
import { EmptyState } from "@/components/player/EmptyState";
import { Header } from "@/components/player/Header";
import { HeroCard } from "@/components/player/HeroCard";
import { LoadingSkeleton } from "@/components/player/LoadingSkeleton";
import { PlayerBar } from "@/components/player/PlayerBar";
import { ReaderPanel } from "@/components/player/ReaderPanel";
import { SettingsDrawer } from "@/components/player/SettingsDrawer";
import { Sidebar } from "@/components/player/Sidebar";
import type { SleepMode } from "@/components/player/SleepTimerButton";
import { Toast } from "@/components/player/Toast";
import type {
  Chunk,
  ChunkStatus,
  HistoryItem,
  LoadedChapter,
} from "@/components/player/types";

const VOICES: Array<{ id: string; label: string }> = [
  { id: "en-US-AvaNeural", label: "Ava (US, female, natural)" },
  { id: "en-US-AndrewNeural", label: "Andrew (US, male, warm)" },
  { id: "en-US-EmmaNeural", label: "Emma (US, female, warm)" },
  { id: "en-US-BrianNeural", label: "Brian (US, male, clear)" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK, female)" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK, male)" },
  { id: "en-US-GuyNeural", label: "Guy (US, male)" },
  { id: "en-US-JennyNeural", label: "Jenny (US, female)" },
];

const LS_URL = "nab:lastUrl";
const LS_VOICE = "nab:voice";
const LS_SPEED = "nab:speed";
const LS_POSITION_PREFIX = "nab:pos:";
const LS_HISTORY = "nab:history";
const LS_READER_FONT = "nab:readerFont";
const LS_PLAYER_VISIBLE = "nab:playerVisible";
const LS_THEME = "nab:theme";

type Theme = "dark" | "light";

export default function Player() {
  const [inputUrl, setInputUrl] = useState("");
  const [current, setCurrent] = useState<LoadedChapter | null>(null);
  const [nextPrefetch, setNextPrefetch] = useState<LoadedChapter | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [playbackRate, setPlaybackRate] = useState<number>(1.15);
  const [readerFontSize, setReaderFontSize] = useState(18);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunkPosition, setChunkPosition] = useState(0);
  const [chunkDuration, setChunkDuration] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [playerBarVisible, setPlayerBarVisible] = useState(true);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [sleep, setSleep] = useState<SleepMode>(null);
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);
  // Theme state. The initial value comes from the pre-hydration script in
  // `app/layout.tsx`, which already set `data-theme` on <html>; we read it
  // back here so React state stays in sync without causing a flash.
  const [theme, setTheme] = useState<Theme>("dark");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  // Latches intent to auto-play across chunk/chapter transitions, even if the
  // browser fires `pause` while the next source is still loading.
  const wantPlayRef = useRef(false);
  // Guards one-time auto-resume of the last chapter on first mount so we
  // don't re-trigger a load if the callback identity changes later.
  const didAutoResumeRef = useRef(false);

  useEffect(() => {
    const savedUrl = localStorage.getItem(LS_URL);
    const savedVoice = localStorage.getItem(LS_VOICE);
    const savedSpeed = localStorage.getItem(LS_SPEED);
    const savedHistory = localStorage.getItem(LS_HISTORY);
    const savedFont = localStorage.getItem(LS_READER_FONT);
    const savedPlayerVisible = localStorage.getItem(LS_PLAYER_VISIBLE);
    if (savedUrl) setInputUrl(savedUrl);
    if (savedVoice) setVoice(savedVoice);
    if (savedSpeed) {
      const n = parseFloat(savedSpeed);
      if (!Number.isNaN(n)) setPlaybackRate(n);
    }
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch {
        setHistory([]);
      }
    }
    if (savedFont) {
      const n = parseInt(savedFont, 10);
      if (!Number.isNaN(n)) setReaderFontSize(n);
    }
    if (savedPlayerVisible === "0") setPlayerBarVisible(false);
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") setTheme(attr);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(LS_THEME, theme);
    } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => localStorage.setItem(LS_VOICE, voice), [voice]);
  useEffect(() => localStorage.setItem(LS_SPEED, String(playbackRate)), [playbackRate]);
  useEffect(
    () => localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(0, 20))),
    [history],
  );
  useEffect(
    () => localStorage.setItem(LS_READER_FONT, String(readerFontSize)),
    [readerFontSize],
  );
  useEffect(
    () => localStorage.setItem(LS_PLAYER_VISIBLE, playerBarVisible ? "1" : "0"),
    [playerBarVisible],
  );

  // Apply playbackRate whenever it changes OR whenever the chunk index moves
  // (new audio source). Some browsers reset rate back to 1.0 on src change,
  // so we re-apply on each transition. onLoadedMetadata also re-applies it
  // once the new audio element finishes loading.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = playbackRate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  }, [playbackRate, current, currentChunkIndex]);

  // Sleep timer: ticks the time-based mode, fades volume in the final 10s,
  // and pauses when time runs out. For "chunk"/"chapter" modes we just
  // surface the label; the actual stop happens inside onEnded.
  useEffect(() => {
    const a = audioRef.current;
    if (!sleep) {
      setSleepRemainingMs(0);
      if (a && a.volume < 1) a.volume = 1;
      return;
    }
    if (sleep.kind !== "time") {
      setSleepRemainingMs(0);
      if (a && a.volume < 1) a.volume = 1;
      return;
    }
    const endsAt = sleep.endsAt;
    const FADE_MS = 10_000;
    const tick = () => {
      const remaining = endsAt - Date.now();
      setSleepRemainingMs(Math.max(0, remaining));
      const el = audioRef.current;
      if (el) {
        if (remaining < FADE_MS && remaining > 0) {
          el.volume = Math.max(0, remaining / FADE_MS);
        } else if (el.volume < 1) {
          el.volume = 1;
        }
      }
      if (remaining <= 0) {
        if (el) {
          el.pause();
          el.volume = 1;
        }
        wantPlayRef.current = false;
        setIsPlaying(false);
        setSleep(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [sleep]);

  const cancelSleep = useCallback(() => {
    const a = audioRef.current;
    if (a && a.volume < 1) a.volume = 1;
    setSleep(null);
    setSleepRemainingMs(0);
  }, []);

  const fetchChapter = useCallback(
    async (url: string, signal?: AbortSignal): Promise<Chapter> => {
      const res = await fetch(`/api/chapter?url=${encodeURIComponent(url)}`, { signal });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error ?? `Failed to load chapter (${res.status})`);
      }
      return data.chapter as Chapter;
    },
    [],
  );

  const buildChunks = useCallback((chapter: Chapter): Chunk[] => {
    return chunkParagraphs(chapter.paragraphs).map((text, index) => ({
      index,
      text,
      blobUrl: null,
      status: "pending" as ChunkStatus,
    }));
  }, []);

  const fetchChunkAudio = useCallback(
    async (text: string, signal?: AbortSignal): Promise<string> => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
        signal,
      });
      if (!res.ok) throw new Error(`TTS failed (${res.status})`);
      return URL.createObjectURL(await res.blob());
    },
    [voice],
  );

  const preloadChunk = useCallback(
    async (
      loaded: LoadedChapter,
      setLoaded: (v: LoadedChapter) => void,
      chunkIndex: number,
      signal?: AbortSignal,
    ) => {
      const chunk = loaded.chunks[chunkIndex];
      if (!chunk || chunk.status === "ready" || chunk.status === "loading") return;
      loaded.chunks[chunkIndex] = { ...chunk, status: "loading" };
      setLoaded({ ...loaded, chunks: [...loaded.chunks] });
      try {
        const blobUrl = await fetchChunkAudio(chunk.text, signal);
        loaded.chunks[chunkIndex] = {
          ...loaded.chunks[chunkIndex],
          blobUrl,
          status: "ready",
        };
        setLoaded({ ...loaded, chunks: [...loaded.chunks] });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        loaded.chunks[chunkIndex] = {
          ...loaded.chunks[chunkIndex],
          status: "error",
          error: (err as Error).message,
        };
        setLoaded({ ...loaded, chunks: [...loaded.chunks] });
      }
    },
    [fetchChunkAudio],
  );

  const pushHistory = useCallback((chapter: Chapter) => {
    const item: HistoryItem = {
      url: chapter.url,
      title: chapter.title,
      source: chapter.source,
      coverSeed: chapter.title,
      lastAt: Date.now(),
    };
    setHistory((prev) => [item, ...prev.filter((p) => p.url !== item.url)].slice(0, 20));
  }, []);

  const loadChapterFromUrl = useCallback(
    async (url: string, autoplay = false) => {
      abortRef.current?.abort();
      prefetchAbortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      setChapterLoading(true);
      setIsPlaying(false);
      if (current)
        for (const c of current.chunks) if (c.blobUrl) URL.revokeObjectURL(c.blobUrl);
      if (nextPrefetch)
        for (const c of nextPrefetch.chunks)
          if (c.blobUrl) URL.revokeObjectURL(c.blobUrl);
      setNextPrefetch(null);
      try {
        const chapter = await fetchChapter(url, ac.signal);
        const loaded: LoadedChapter = { chapter, chunks: buildChunks(chapter) };
        setCurrent(loaded);
        setCurrentChunkIndex(0);
        localStorage.setItem(LS_URL, url);
        pushHistory(chapter);
        await preloadChunk(loaded, setCurrent, 0, ac.signal);
        if (loaded.chunks.length > 1)
          preloadChunk(loaded, setCurrent, 1, ac.signal).catch(() => {});
        setChapterLoading(false);
        if (autoplay) {
          const a = audioRef.current;
          if (a) {
            try {
              await a.play();
              setIsPlaying(true);
            } catch {}
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setChapterLoading(false);
        setError((err as Error).message);
      }
    },
    [buildChunks, current, fetchChapter, nextPrefetch, preloadChunk, pushHistory],
  );

  // Auto-resume the last chapter on first mount. `loadChapterFromUrl` itself
  // will pick up the saved chunk index + offset from the per-chapter position
  // key. Runs exactly once thanks to the ref latch.
  useEffect(() => {
    if (didAutoResumeRef.current) return;
    const savedUrl = localStorage.getItem(LS_URL);
    if (!savedUrl) return;
    didAutoResumeRef.current = true;
    void loadChapterFromUrl(savedUrl, false);
  }, [loadChapterFromUrl]);

  useEffect(() => {
    if (!current?.chapter.nextUrl) return;
    if (nextPrefetch && nextPrefetch.chapter.url === current.chapter.nextUrl) return;
    prefetchAbortRef.current?.abort();
    const ac = new AbortController();
    prefetchAbortRef.current = ac;
    (async () => {
      try {
        const ch = await fetchChapter(current.chapter.nextUrl!, ac.signal);
        const loaded: LoadedChapter = { chapter: ch, chunks: buildChunks(ch) };
        setNextPrefetch(loaded);
        preloadChunk(loaded, setNextPrefetch, 0, ac.signal).catch(() => {});
      } catch {}
    })();
  }, [current, nextPrefetch, fetchChapter, buildChunks, preloadChunk]);

  useEffect(() => {
    if (!current) return;
    if (current.chunks[currentChunkIndex + 1]?.status === "pending") {
      preloadChunk(current, setCurrent, currentChunkIndex + 1).catch(() => {});
    }
    if (current.chunks[currentChunkIndex + 2]?.status === "pending") {
      preloadChunk(current, setCurrent, currentChunkIndex + 2).catch(() => {});
    }
  }, [currentChunkIndex, current, preloadChunk]);

  const currentChunk = current?.chunks[currentChunkIndex];
  const audioSrc = currentChunk?.blobUrl ?? "";

  // Manage audio src imperatively so onEnded can advance audio synchronously
  // (within the ended event stack) without React's reconciliation later
  // clobbering the src we already set and triggering a reload.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!audioSrc) {
      if (a.hasAttribute("src")) a.removeAttribute("src");
      return;
    }
    if (a.src !== audioSrc) a.src = audioSrc;
  }, [audioSrc]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !audioSrc) return;
    if (wantPlayRef.current || isPlaying) {
      wantPlayRef.current = false;
      a.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [audioSrc, isPlaying]);

  const onEnded = useCallback(() => {
    const a = audioRef.current;
    if (!current || !a) return;
    const nextIdx = currentChunkIndex + 1;

    // Sleep timer: stop at the end of the current part.
    if (sleep?.kind === "chunk") {
      wantPlayRef.current = false;
      setIsPlaying(false);
      setSleep(null);
      return;
    }

    if (nextIdx < current.chunks.length) {
      const nextBlobUrl = current.chunks[nextIdx]?.blobUrl;
      if (nextBlobUrl) {
        // Advance audio synchronously within the ended event so backgrounded tabs
        // and locked screens can't block play() via throttled React renders.
        a.src = nextBlobUrl;
        a.play().catch(() => { wantPlayRef.current = true; });
      } else {
        // Blob not ready yet — preload effect will resume once it lands.
        wantPlayRef.current = true;
      }
      setCurrentChunkIndex(nextIdx);
      return;
    }

    // Sleep timer: stop at the end of the chapter (final chunk just ended).
    if (sleep?.kind === "chapter") {
      wantPlayRef.current = false;
      setIsPlaying(false);
      setSleep(null);
      return;
    }

    if (nextPrefetch) {
      for (const c of current.chunks) if (c.blobUrl) URL.revokeObjectURL(c.blobUrl);
      const firstBlobUrl = nextPrefetch.chunks[0]?.blobUrl;
      if (firstBlobUrl) {
        a.src = firstBlobUrl;
        a.play().catch(() => { wantPlayRef.current = true; });
      } else {
        wantPlayRef.current = true;
      }
      setCurrent(nextPrefetch);
      setNextPrefetch(null);
      setCurrentChunkIndex(0);
      localStorage.setItem(LS_URL, nextPrefetch.chapter.url);
      // Keep the "most recent" sort order fresh so reopening the app jumps
      // straight to whatever was playing last, even on background auto-advance.
      pushHistory(nextPrefetch.chapter);
      setIsPlaying(true);
      return;
    }
    if (current.chapter.nextUrl) {
      wantPlayRef.current = true;
      return void loadChapterFromUrl(current.chapter.nextUrl, true);
    }
    setIsPlaying(false);
  }, [current, currentChunkIndex, nextPrefetch, loadChapterFromUrl, sleep, pushHistory]);

  const togglePlay = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) {
      if (!audioSrc && currentChunk?.status === "pending")
        preloadChunk(current, setCurrent, currentChunkIndex).catch(() => {});
      try {
        await a.play();
        setIsPlaying(true);
      } catch (err) {
        setError(`Play blocked: ${(err as Error).message}`);
      }
    } else {
      a.pause();
      setIsPlaying(false);
    }
  }, [audioSrc, current, currentChunk, currentChunkIndex, preloadChunk]);

  const seekSeconds = useCallback(
    (delta: number) => {
      const a = audioRef.current;
      if (!a || !current) return;
      const newT = a.currentTime + delta;
      if (newT < 0) {
        if (currentChunkIndex > 0) setCurrentChunkIndex(currentChunkIndex - 1);
        else a.currentTime = 0;
        return;
      }
      if (newT > a.duration) {
        if (currentChunkIndex < current.chunks.length - 1)
          setCurrentChunkIndex(currentChunkIndex + 1);
        else a.currentTime = Math.max(0, a.duration - 0.1);
        return;
      }
      a.currentTime = newT;
    },
    [current, currentChunkIndex],
  );

  const seekTo = useCallback((next: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = next;
    setChunkPosition(next);
  }, []);

  const goPrevChapter = useCallback(() => {
    if (current?.chapter.prevUrl) loadChapterFromUrl(current.chapter.prevUrl, true);
  }, [current, loadChapterFromUrl]);
  const goNextChapter = useCallback(() => {
    if (current?.chapter.nextUrl) loadChapterFromUrl(current.chapter.nextUrl, true);
  }, [current, loadChapterFromUrl]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !current)
      return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.chapter.title,
      artist: current.chapter.source,
      album: "Tome",
    });
    navigator.mediaSession.setActionHandler("play", () => void togglePlay());
    navigator.mediaSession.setActionHandler("pause", () => void togglePlay());
    navigator.mediaSession.setActionHandler("nexttrack", goNextChapter);
    navigator.mediaSession.setActionHandler("previoustrack", goPrevChapter);
    navigator.mediaSession.setActionHandler("seekbackward", (d) => seekSeconds(-(d.seekOffset ?? 15)));
    navigator.mediaSession.setActionHandler("seekforward", (d) => seekSeconds(d.seekOffset ?? 15));
    navigator.mediaSession.setActionHandler("seekto", (d) => { if (d.seekTime != null) seekTo(d.seekTime); });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [current, togglePlay, goPrevChapter, goNextChapter, seekSeconds, seekTo]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Persist playback position: a 3s interval covers the common case, and
  // `visibilitychange` / `pagehide` / `beforeunload` guarantee a final flush
  // when the user switches tabs, locks their phone, or closes the app — the
  // interval is throttled or paused in background, so those events are what
  // actually keep resume-on-reopen accurate.
  useEffect(() => {
    if (!current) return;
    const key = LS_POSITION_PREFIX + current.chapter.url;
    const save = () => {
      const a = audioRef.current;
      if (!a) return;
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ chunk: currentChunkIndex, offset: a.currentTime }),
        );
      } catch {}
    };
    const t = setInterval(save, 3000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    const onHide = () => save();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [current, currentChunkIndex]);

  useEffect(() => {
    if (!current) return;
    const key = LS_POSITION_PREFIX + current.chapter.url;
    const saved = localStorage.getItem(key);
    if (!saved) return;
    try {
      const pos = JSON.parse(saved);
      if (
        typeof pos?.chunk === "number" &&
        pos.chunk >= 0 &&
        pos.chunk < current.chunks.length
      ) {
        setCurrentChunkIndex(pos.chunk);
      }
    } catch {}
  }, [current?.chapter.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    // Re-assert playback rate: some browsers drop it back to 1.0 when the
    // audio source changes between chunks/chapters.
    a.playbackRate = playbackRate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    setChunkDuration(a.duration || 0);
    const key = LS_POSITION_PREFIX + current.chapter.url;
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return;
      const pos = JSON.parse(saved);
      if (pos?.chunk === currentChunkIndex && typeof pos.offset === "number") {
        if (pos.offset > 0 && pos.offset < (a.duration || Infinity) - 1)
          a.currentTime = pos.offset;
        localStorage.removeItem(key);
      }
    } catch {}
  }, [current, currentChunkIndex, playbackRate]);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setChunkPosition(a.currentTime);
  }, []);

  // Double-tap/click anywhere brings the header back. Requires two quick taps
  // so a single accidental tap while reading doesn't pop the menu open.
  useEffect(() => {
    if (!headerHidden) return;
    const DOUBLE_TAP_MS = 350;
    let lastTapAt = 0;
    const onPointer = () => {
      const now = Date.now();
      if (now - lastTapAt <= DOUBLE_TAP_MS) {
        lastTapAt = 0;
        setHeaderHidden(false);
        return;
      }
      lastTapAt = now;
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [headerHidden]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        void togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekSeconds(-15);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekSeconds(15);
      } else if (e.key === "[") {
        e.preventDefault();
        goPrevChapter();
      } else if (e.key === "]") {
        e.preventDefault();
        goNextChapter();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekSeconds, goPrevChapter, goNextChapter]);

  const progressPercent = useMemo(() => {
    if (!current || current.chunks.length === 0) return 0;
    const per = 1 / current.chunks.length;
    const chunkFrac = chunkDuration > 0 ? chunkPosition / chunkDuration : 0;
    return (currentChunkIndex + Math.min(chunkFrac, 1)) * per * 100;
  }, [current, currentChunkIndex, chunkPosition, chunkDuration]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = inputUrl.trim();
    if (!u) return;
    setSidebarOpen(false);
    void loadChapterFromUrl(u, false);
  };

  return (
    <div className="flex h-dvh flex-col bg-[var(--color-bg)]">
      <Header
        showLibraryToggle
        onOpenLibrary={() => setSidebarOpen(true)}
        onOpenSettings={() => setDrawerOpen(true)}
        playerBarVisible={playerBarVisible}
        onTogglePlayerBar={() => setPlayerBarVisible((v) => !v)}
        hasChapter={!!current}
        hidden={headerHidden}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {error && <Toast message={error} onClose={() => setError(null)} />}

      <div
        className={`grid w-full min-h-0 flex-1 gap-4 py-4 sm:px-6 lg:gap-6 lg:px-8 ${
          playerBarVisible ? "px-4 lg:grid-cols-[300px_1fr]" : "px-0"
        }`}
      >
        {playerBarVisible && (
          <aside className="hidden min-h-0 lg:block">
            <Sidebar
              inputUrl={inputUrl}
              onInputUrl={setInputUrl}
              onSubmitUrl={onSubmit}
              chapterLoading={chapterLoading}
              history={history}
              onPickHistory={(url) => {
                setInputUrl(url);
                void loadChapterFromUrl(url, false);
              }}
            />
          </aside>
        )}

        <main className="flex min-h-0 flex-col gap-3">
          {chapterLoading && <LoadingSkeleton />}
          {!chapterLoading && !current && <EmptyState />}
          {!chapterLoading && current && (
            <>
              <div className="min-h-0 flex-1">
                <ReaderPanel
                  chunks={current.chunks}
                  currentChunkIndex={currentChunkIndex}
                  onPickChunk={(index) =>
                    setCurrentChunkIndex(
                      Math.max(0, Math.min(current.chunks.length - 1, index)),
                    )
                  }
                  readerFontSize={readerFontSize}
                  readingMode={!playerBarVisible}
                  onUserScroll={() => setHeaderHidden(true)}
                  canReachEnd={!!current.chapter.nextUrl}
                  onReachedEnd={() => {
                    const nextUrl = current.chapter.nextUrl;
                    if (!nextUrl) return;
                    void loadChapterFromUrl(nextUrl, isPlaying);
                  }}
                  header={
                    <HeroCard
                      title={current.chapter.title}
                      source={current.chapter.source}
                      currentPart={currentChunkIndex + 1}
                      totalParts={current.chunks.length}
                      canPrevChapter={!!current.chapter.prevUrl}
                      canNextChapter={!!current.chapter.nextUrl}
                      onPrevChapter={goPrevChapter}
                      onNextChapter={goNextChapter}
                    />
                  }
                />
              </div>
              {shortcutsOpen && (
                <div className="grid shrink-0 gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-muted)]">
                  <div>Space — Play/Pause</div>
                  <div>Arrow Left/Right — -/+ 15s</div>
                  <div>[ / ] — Previous/Next chapter</div>
                  <div>? — Toggle this help</div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 p-4 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="h-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar
              inputUrl={inputUrl}
              onInputUrl={setInputUrl}
              onSubmitUrl={onSubmit}
              chapterLoading={chapterLoading}
              history={history}
              onPickHistory={(url) => {
                setInputUrl(url);
                setSidebarOpen(false);
                void loadChapterFromUrl(url, false);
              }}
            />
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPause={() => {
          // Ignore pause events that fire while we're mid-transition to the
          // next chunk (no src yet or we already intend to play as soon as it
          // loads). This keeps auto-advance working even if the next chunk's
          // TTS hasn't finished yet.
          if (wantPlayRef.current || !audioSrc) return;
          setIsPlaying(false);
        }}
        onPlay={() => setIsPlaying(true)}
        preload="auto"
        playsInline
      />

      {playerBarVisible && (
        <PlayerBar
          hasChapter={!!current}
          isPlaying={isPlaying}
          progressPercent={progressPercent}
          currentTime={chunkPosition}
          duration={chunkDuration}
          onSeek={seekTo}
          onTogglePlay={togglePlay}
          onSkipBack={() => seekSeconds(-15)}
          onSkipFwd={() => seekSeconds(15)}
          currentChunkIndex={currentChunkIndex}
          totalChunks={current?.chunks.length ?? 0}
          currentChunkStatus={currentChunk?.status ?? "pending"}
          prefetchReady={
            !!nextPrefetch?.chunks[0] && nextPrefetch.chunks[0].status === "ready"
          }
          onPickChunk={(i) =>
            current &&
            setCurrentChunkIndex(Math.max(0, Math.min(current.chunks.length - 1, i)))
          }
          sleep={sleep}
          sleepRemainingMs={sleepRemainingMs}
          onSleepSet={setSleep}
          onSleepCancel={cancelSleep}
          playbackRate={playbackRate}
          onPlaybackRate={setPlaybackRate}
        />
      )}

      {!playerBarVisible && current && (
        <button
          onClick={() => setPlayerBarVisible(true)}
          aria-label="Show player"
          className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel)]/90 px-4 py-2 text-xs font-medium text-[var(--color-text)]/90 shadow-lg backdrop-blur-md transition hover:border-white/20 hover:text-[var(--color-text)]"
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isPlaying
                ? "bg-[var(--color-accent)] animate-pulse"
                : "bg-[var(--color-muted)]"
            }`}
          />
          Show player
        </button>
      )}

      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        voice={voice}
        onVoice={setVoice}
        voices={VOICES}
        readerFontSize={readerFontSize}
        onReaderFontSize={setReaderFontSize}
      />
    </div>
  );
}
