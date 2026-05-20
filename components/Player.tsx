"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "@/lib/types";
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

interface ChapterMetaResponse {
  ok: true;
  key: string;
  voice: string;
  chapter: Chapter;
  chunks: Array<{ index: number; text: string; estDuration: number }>;
}

interface ChapterMetaError {
  ok: false;
  error: string;
}

interface HlsLike {
  loadSource: (url: string) => void;
  attachMedia: (audio: HTMLMediaElement) => void;
  destroy: () => void;
}

function buildLoadedChapter(meta: ChapterMetaResponse): LoadedChapter {
  const chunks: Chunk[] = meta.chunks.map((c) => ({
    index: c.index,
    text: c.text,
    estDuration: c.estDuration,
  }));
  const cumDurations: number[] = [0];
  for (let i = 0; i < chunks.length; i++) {
    cumDurations.push(cumDurations[i] + chunks[i].estDuration);
  }
  return {
    chapter: meta.chapter,
    chunks,
    cumDurations,
    totalDuration: cumDurations[cumDurations.length - 1] ?? 0,
    playlistUrl: `/api/chapter-hls?url=${encodeURIComponent(meta.chapter.url)}&voice=${encodeURIComponent(meta.voice)}`,
    voice: meta.voice,
  };
}

function findChunkAtTime(cumDurations: number[], t: number): number {
  if (cumDurations.length <= 1) return 0;
  let lo = 0;
  let hi = cumDurations.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (cumDurations[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export default function Player() {
  const [inputUrl, setInputUrl] = useState("");
  const [current, setCurrent] = useState<LoadedChapter | null>(null);
  const [nextPrefetch, setNextPrefetch] = useState<LoadedChapter | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
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
  const [theme, setTheme] = useState<Theme>("dark");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<HlsLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  // Latch playback intent across the (single) chapter-boundary src swap so a
  // spurious `pause` event mid-swap can't drop us out of the playing state.
  const wantPlayRef = useRef(false);
  const didAutoResumeRef = useRef(false);
  // Hold the last chunk index at which sleep="chunk" arming began. We pause
  // when the index advances past that.
  const sleepChunkStartRef = useRef<number | null>(null);

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

  useEffect(() => { try { localStorage.setItem(LS_VOICE, voice); } catch {} }, [voice]);
  useEffect(() => { try { localStorage.setItem(LS_SPEED, String(playbackRate)); } catch {} }, [playbackRate]);
  useEffect(() => {
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(0, 20))); } catch {}
  }, [history]);
  useEffect(() => {
    try { localStorage.setItem(LS_READER_FONT, String(readerFontSize)); } catch {}
  }, [readerFontSize]);
  useEffect(() => {
    try { localStorage.setItem(LS_PLAYER_VISIBLE, playerBarVisible ? "1" : "0"); } catch {}
  }, [playerBarVisible]);

  // Re-apply playback rate when chapter swaps. Safari resets to 1.0 on src change.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = playbackRate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  }, [playbackRate, current]);

  // Sleep timer — see comments in old impl. Volume fade fires only in "time"
  // mode; "chunk"/"chapter" are handled in onTimeUpdate / onEnded.
  useEffect(() => {
    const a = audioRef.current;
    if (!sleep) {
      setSleepRemainingMs(0);
      sleepChunkStartRef.current = null;
      if (a && a.volume < 1) a.volume = 1;
      return;
    }
    if (sleep.kind === "chunk") {
      sleepChunkStartRef.current = currentChunkIndex;
    } else {
      sleepChunkStartRef.current = null;
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
  }, [sleep, currentChunkIndex]);

  const cancelSleep = useCallback(() => {
    const a = audioRef.current;
    if (a && a.volume < 1) a.volume = 1;
    setSleep(null);
    setSleepRemainingMs(0);
  }, []);

  const fetchChapterMeta = useCallback(
    async (url: string, requestedVoice: string, signal?: AbortSignal): Promise<LoadedChapter> => {
      const res = await fetch(
        `/api/chapter-meta?url=${encodeURIComponent(url)}&voice=${encodeURIComponent(requestedVoice)}`,
        { signal },
      );
      const data = (await res.json()) as ChapterMetaResponse | ChapterMetaError;
      if (!res.ok || !data.ok) {
        const err = !data.ok ? data.error : `Failed to load chapter (${res.status})`;
        throw new Error(err);
      }
      return buildLoadedChapter(data);
    },
    [],
  );

  const detachHls = useCallback(() => {
    const hls = hlsRef.current;
    if (hls) {
      try { hls.destroy(); } catch {}
      hlsRef.current = null;
    }
  }, []);

  const attachSource = useCallback(async (playlistUrl: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    detachHls();
    const native = audio.canPlayType("application/vnd.apple.mpegurl");
    if (native) {
      audio.src = playlistUrl;
      audio.load();
      return;
    }
    try {
      const mod = await import("hls.js");
      const Hls = (mod as unknown as { default: typeof import("hls.js").default }).default;
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false });
        hls.loadSource(playlistUrl);
        hls.attachMedia(audio);
        hlsRef.current = hls as unknown as HlsLike;
        return;
      }
    } catch {}
    // Last-resort: try native even if canPlayType lied
    audio.src = playlistUrl;
    audio.load();
  }, [detachHls]);

  const pushHistory = useCallback((chapter: Chapter) => {
    const item: HistoryItem = {
      url: chapter.url,
      title: chapter.title,
      source: chapter.source,
      coverSeed: chapter.bookTitle || chapter.title,
      lastAt: Date.now(),
      bookTitle: chapter.bookTitle,
      chapterLabel: chapter.chapterLabel,
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
      setNextPrefetch(null);
      try {
        const loaded = await fetchChapterMeta(url, voice, ac.signal);
        if (ac.signal.aborted) return;
        setCurrent(loaded);
        setCurrentChunkIndex(0);
        setChunkPosition(0);
        setChunkDuration(loaded.chunks[0]?.estDuration ?? 0);
        try { localStorage.setItem(LS_URL, url); } catch {}
        pushHistory(loaded.chapter);
        if (autoplay) wantPlayRef.current = true;
        await attachSource(loaded.playlistUrl);
        setChapterLoading(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setChapterLoading(false);
        setError((err as Error).message);
      }
    },
    [attachSource, fetchChapterMeta, pushHistory, voice],
  );

  // First-mount auto-resume.
  useEffect(() => {
    if (didAutoResumeRef.current) return;
    const savedUrl = localStorage.getItem(LS_URL);
    if (!savedUrl) return;
    didAutoResumeRef.current = true;
    void loadChapterFromUrl(savedUrl, false);
  }, [loadChapterFromUrl]);

  // Reload chapter when voice changes mid-session (server cache keyed by voice).
  // Only fires if a chapter is already loaded and the voice actually changed.
  const lastVoiceRef = useRef(voice);
  useEffect(() => {
    if (lastVoiceRef.current === voice) return;
    lastVoiceRef.current = voice;
    if (!current) return;
    void loadChapterFromUrl(current.chapter.url, isPlaying);
  }, [voice, current, isPlaying, loadChapterFromUrl]);

  // Pre-warm next chapter's parse + segment cache on the server. We only need
  // the meta to know it's valid; segments synth lazy on transition.
  useEffect(() => {
    if (!current?.chapter.nextUrl) return;
    if (nextPrefetch && nextPrefetch.chapter.url === current.chapter.nextUrl) return;
    prefetchAbortRef.current?.abort();
    const ac = new AbortController();
    prefetchAbortRef.current = ac;
    (async () => {
      try {
        const loaded = await fetchChapterMeta(current.chapter.nextUrl!, voice, ac.signal);
        if (ac.signal.aborted) return;
        setNextPrefetch(loaded);
      } catch {}
    })();
    return () => ac.abort();
  }, [current, nextPrefetch, fetchChapterMeta, voice]);

  // Restore saved position once chapter is attached + metadata loaded.
  const pendingRestoreRef = useRef<{ chapter: string; time: number } | null>(null);
  useEffect(() => {
    if (!current) return;
    const key = LS_POSITION_PREFIX + current.chapter.url;
    const saved = localStorage.getItem(key);
    if (!saved) return;
    try {
      const pos = JSON.parse(saved);
      let time = 0;
      if (typeof pos?.time === "number") {
        time = pos.time;
      } else if (typeof pos?.chunk === "number") {
        const idx = Math.max(0, Math.min(current.chunks.length - 1, pos.chunk));
        time = current.cumDurations[idx] + (typeof pos.offset === "number" ? pos.offset : 0);
      }
      if (time > 0 && time < current.totalDuration - 1) {
        pendingRestoreRef.current = { chapter: current.chapter.url, time };
      }
    } catch {}
  }, [current]);

  // Auto-advance to next chapter on end.
  const onEnded = useCallback(() => {
    if (!current) return;
    if (sleep?.kind === "chapter") {
      wantPlayRef.current = false;
      setIsPlaying(false);
      setSleep(null);
      return;
    }
    if (current.chapter.nextUrl) {
      wantPlayRef.current = true;
      void loadChapterFromUrl(current.chapter.nextUrl, true);
      return;
    }
    setIsPlaying(false);
  }, [current, sleep, loadChapterFromUrl]);

  const togglePlay = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) {
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
  }, [current]);

  const seekAbsolute = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t);
  }, []);

  const seekSeconds = useCallback(
    (delta: number) => {
      const a = audioRef.current;
      if (!a || !current) return;
      const newT = a.currentTime + delta;
      seekAbsolute(Math.min(Math.max(0, newT), current.totalDuration - 0.1));
    },
    [current, seekAbsolute],
  );

  const onPickChunk = useCallback(
    (i: number) => {
      if (!current) return;
      const idx = Math.max(0, Math.min(current.chunks.length - 1, i));
      seekAbsolute(current.cumDurations[idx]);
    },
    [current, seekAbsolute],
  );

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
      title: current.chapter.chapterLabel || current.chapter.title,
      artist: current.chapter.bookTitle || current.chapter.source,
      album: "Tome",
    });
    navigator.mediaSession.setActionHandler("play", () => void togglePlay());
    navigator.mediaSession.setActionHandler("pause", () => void togglePlay());
    navigator.mediaSession.setActionHandler("nexttrack", goNextChapter);
    navigator.mediaSession.setActionHandler("previoustrack", goPrevChapter);
    navigator.mediaSession.setActionHandler("seekbackward", (d) => seekSeconds(-(d.seekOffset ?? 15)));
    navigator.mediaSession.setActionHandler("seekforward", (d) => seekSeconds(d.seekOffset ?? 15));
    navigator.mediaSession.setActionHandler("seekto", (d) => { if (d.seekTime != null) seekAbsolute(d.seekTime); });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [current, togglePlay, goPrevChapter, goNextChapter, seekSeconds, seekAbsolute]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Persist playback position: save raw `audio.currentTime` on a 3s interval +
  // visibility/pagehide/beforeunload guards. Same triple-guard as old impl.
  useEffect(() => {
    if (!current) return;
    const key = LS_POSITION_PREFIX + current.chapter.url;
    const save = () => {
      const a = audioRef.current;
      if (!a) return;
      try {
        localStorage.setItem(key, JSON.stringify({ time: a.currentTime }));
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
  }, [current]);

  const onLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.playbackRate = playbackRate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    const pending = pendingRestoreRef.current;
    if (pending && pending.chapter === current.chapter.url) {
      try {
        a.currentTime = pending.time;
      } catch {}
      pendingRestoreRef.current = null;
    }
    if (wantPlayRef.current) {
      wantPlayRef.current = false;
      a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [current, playbackRate]);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    const t = a.currentTime;
    setChunkPosition(t - current.cumDurations[currentChunkIndex]);
    const idx = findChunkAtTime(current.cumDurations, t);
    if (idx !== currentChunkIndex) {
      setCurrentChunkIndex(idx);
      setChunkDuration(current.chunks[idx]?.estDuration ?? 0);
      // Sleep "chunk" mode: pause as soon as the chunk we armed on finishes.
      if (sleep?.kind === "chunk" && sleepChunkStartRef.current !== null) {
        if (idx > sleepChunkStartRef.current) {
          a.pause();
          wantPlayRef.current = false;
          setIsPlaying(false);
          setSleep(null);
        }
      }
    }
  }, [current, currentChunkIndex, sleep]);

  // Double-tap brings header back when hidden.
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

  // Cleanup hls.js instance on unmount.
  useEffect(() => {
    return () => detachHls();
  }, [detachHls]);

  const progressPercent = useMemo(() => {
    if (!current || current.totalDuration <= 0) return 0;
    const a = audioRef.current;
    const t = a?.currentTime ?? current.cumDurations[currentChunkIndex] + chunkPosition;
    return Math.min(100, (t / current.totalDuration) * 100);
  }, [current, currentChunkIndex, chunkPosition]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = inputUrl.trim();
    if (!u) return;
    setSidebarOpen(false);
    void loadChapterFromUrl(u, false);
  };

  const currentChunk = current?.chunks[currentChunkIndex];

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
                  onPickChunk={onPickChunk}
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
                      title={current.chapter.bookTitle || current.chapter.title}
                      source={current.chapter.source}
                      chapterLabel={current.chapter.chapterLabel}
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
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => { setIsBuffering(false); setIsPlaying(true); }}
        onPause={() => {
          if (wantPlayRef.current) return;
          setIsPlaying(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onError={() => {
          setIsBuffering(false);
          // Recover by re-attaching the playlist; HLS players sometimes fall over
          // on stale tokens or transient 5xx from the segment route.
          if (current) void attachSource(current.playlistUrl);
        }}
        preload="auto"
        playsInline
      />

      {playerBarVisible && (
        <PlayerBar
          hasChapter={!!current}
          isPlaying={isPlaying}
          progressPercent={progressPercent}
          currentTime={chunkPosition}
          duration={chunkDuration || (currentChunk?.estDuration ?? 0)}
          onSeek={(next) => {
            if (!current) return;
            seekAbsolute(current.cumDurations[currentChunkIndex] + next);
          }}
          onTogglePlay={togglePlay}
          onSkipBack={() => seekSeconds(-15)}
          onSkipFwd={() => seekSeconds(15)}
          currentChunkIndex={currentChunkIndex}
          totalChunks={current?.chunks.length ?? 0}
          isBuffering={isBuffering}
          hasError={!!error}
          prefetchReady={!!nextPrefetch}
          onPickChunk={onPickChunk}
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
