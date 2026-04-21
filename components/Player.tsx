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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const savedUrl = localStorage.getItem(LS_URL);
    const savedVoice = localStorage.getItem(LS_VOICE);
    const savedSpeed = localStorage.getItem(LS_SPEED);
    const savedHistory = localStorage.getItem(LS_HISTORY);
    const savedFont = localStorage.getItem(LS_READER_FONT);
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

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = playbackRate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  }, [playbackRate, current]);

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

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !audioSrc) return;
    a.load();
    if (isPlaying) a.play().catch(() => setIsPlaying(false));
  }, [audioSrc, isPlaying]);

  const onEnded = useCallback(() => {
    if (!current) return;
    const nextIdx = currentChunkIndex + 1;
    if (nextIdx < current.chunks.length) return setCurrentChunkIndex(nextIdx);
    if (nextPrefetch) {
      if (current)
        for (const c of current.chunks) if (c.blobUrl) URL.revokeObjectURL(c.blobUrl);
      setCurrent(nextPrefetch);
      setNextPrefetch(null);
      setCurrentChunkIndex(0);
      localStorage.setItem(LS_URL, nextPrefetch.chapter.url);
      setIsPlaying(true);
      return;
    }
    if (current.chapter.nextUrl) return void loadChapterFromUrl(current.chapter.nextUrl, true);
    setIsPlaying(false);
  }, [current, currentChunkIndex, nextPrefetch, loadChapterFromUrl]);

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
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const key = LS_POSITION_PREFIX + current.chapter.url;
    const t = setInterval(() => {
      const a = audioRef.current;
      if (!a) return;
      localStorage.setItem(
        key,
        JSON.stringify({ chunk: currentChunkIndex, offset: a.currentTime }),
      );
    }, 3000);
    return () => clearInterval(t);
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
  }, [current, currentChunkIndex]);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setChunkPosition(a.currentTime);
  }, []);

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
    <div className="min-h-dvh bg-[var(--color-bg)] pb-44">
      <Header
        showLibraryToggle
        onOpenLibrary={() => setSidebarOpen(true)}
        onOpenSettings={() => setDrawerOpen(true)}
      />

      {error && <Toast message={error} onClose={() => setError(null)} />}

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">
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
        </div>

        <main>
          {chapterLoading && <LoadingSkeleton />}
          {!chapterLoading && !current && <EmptyState />}
          {!chapterLoading && current && (
            <div className="space-y-5">
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
              <ReaderPanel
                chunks={current.chunks}
                currentChunkIndex={currentChunkIndex}
                onPickChunk={(index) =>
                  setCurrentChunkIndex(
                    Math.max(0, Math.min(current.chunks.length - 1, index)),
                  )
                }
                readerFontSize={readerFontSize}
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShortcutsOpen((v) => !v)}
                  className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
                >
                  Keyboard shortcuts (?)
                </button>
              </div>
              {shortcutsOpen && (
                <div className="grid gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-muted)]">
                  <div>Space — Play/Pause</div>
                  <div>Arrow Left/Right — -/+ 15s</div>
                  <div>[ / ] — Previous/Next chapter</div>
                  <div>? — Toggle this help</div>
                </div>
              )}
            </div>
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
        src={audioSrc || undefined}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        preload="auto"
        playsInline
      />

      <PlayerBar
        hasChapter={!!current}
        title={current?.chapter.title ?? ""}
        source={current?.chapter.source ?? ""}
        isPlaying={isPlaying}
        progressPercent={progressPercent}
        currentTime={chunkPosition}
        duration={chunkDuration}
        onSeek={seekTo}
        onTogglePlay={togglePlay}
        onSkipBack={() => seekSeconds(-15)}
        onSkipFwd={() => seekSeconds(15)}
        onPrevChapter={goPrevChapter}
        onNextChapter={goNextChapter}
        canPrevChapter={!!current?.chapter.prevUrl}
        canNextChapter={!!current?.chapter.nextUrl}
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
      />

      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        voice={voice}
        onVoice={setVoice}
        voices={VOICES}
        playbackRate={playbackRate}
        onPlaybackRate={setPlaybackRate}
        readerFontSize={readerFontSize}
        onReaderFontSize={setReaderFontSize}
      />
    </div>
  );
}
