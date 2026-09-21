"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "@/lib/types";
import { LoadingSkeleton } from "@/components/player/LoadingSkeleton";
import type { ReaderFace, ReaderMargin } from "@/components/player/ReaderPanel";
import type { SleepMode } from "@/components/player/SleepTimerButton";
import { Toast } from "@/components/player/Toast";
import { AddSheet } from "@/components/screens/AddSheet";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { LibraryScreen } from "@/components/screens/LibraryScreen";
import { NowPlayingScreen } from "@/components/screens/NowPlayingScreen";
import { ReaderScreen } from "@/components/screens/ReaderScreen";
import { FONT_MAX, FONT_MIN, ReaderSettingsSheet, type ReaderPrefs } from "@/components/screens/ReaderSettings";
import { SearchScreen } from "@/components/screens/SearchScreen";
import { YouScreen } from "@/components/screens/YouScreen";
import type { AudioState, NarrationSummary, NowPlaying } from "@/components/screens/shared";
import { MiniPlayer } from "@/components/shell/MiniPlayer";
import { BottomNav, NavRail, type Tab } from "@/components/shell/Nav";
import { AlertIcon } from "@/components/ui/icons";
import { groupHistoryByBook } from "@/lib/library/group";
import { useTheme } from "@/lib/theme";
import type { useLibrary } from "@/lib/library/useLibrary";
import { useTitleRepair } from "@/lib/library/useTitleRepair";
import { bookKey, type ChapterProgress } from "@/lib/library/types";
import { writeLegacyPosition } from "@/lib/library/local";
import { authorizedFetch } from "@/lib/supabase/browser";
import { usePlaybackSession } from "@/lib/audio/usePlaybackSession";
import { restoreApplies, type PendingRestore } from "@/lib/audio/restore";
import {
  normalizeMode,
  type Chunk,
  type HistoryItem,
  type LoadedChapter,
  type ViewMode,
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
const LS_READER_LINE = "nab:readerLine";
const LS_READER_FACE = "nab:readerFace";
const LS_READER_MARGIN = "nab:readerMargin";
const LS_VIEW_MODE = "nab:viewMode";
const LS_MEDIA_LOG = "nab:mediaLog";
const LS_COVERS = "nab:covers";
// How long the element may claim to be playing without its clock advancing
// before we treat the native player as dead. Longer than one segment (6s) so an
// ordinary rebuffer is not mistaken for a stall.
const STALL_TIMEOUT_MS = 10_000;
const MEDIA_LOG_CAP = 80;
const MEDIA_LOG_EVENTS = ["waiting", "stalled", "suspend", "playing", "pause", "ended", "error", "ratechange"] as const;
// Backoff for re-reading the session playlist after it ends while later
// chapters are still being synthesized. Reaching the end used to stop the book
// for good, because a single refresh that came back empty was treated as "no
// more audio" rather than "not yet".
const CONTINUE_RETRY_MS = [3_000, 5_000, 8_000, 12_000, 15_000];
const MAX_CONTINUE_ATTEMPTS = 40;
// A queued seek blocks progress capture so we never save a position we have not
// applied yet. Bounded, so a restore that never matches cannot freeze saving.
const PENDING_RESTORE_GRACE_MS = 5_000;


type MediaLogEntry = {
  t: number;
  e: string;
  ct: number;
  rs: number;
  ns: number;
  buf: number;
  err?: string;
};

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

interface ChapterTiming {
  durations: number[];
  cumDurations: number[];
  totalDuration: number;
}

// Chunk timeline using real (measured) durations where the server has them,
// falling back to the chars-per-second estimate. Estimates alone drift by
// minutes over a chapter, which made the chained next chapter start before
// we thought the current one had ended.
function buildTiming(chunks: Chunk[], real: Array<number | null> | null): ChapterTiming {
  const durations = chunks.map((c, i) => real?.[i] ?? c.estDuration);
  const cumDurations: number[] = [0];
  for (const d of durations) cumDurations.push(cumDurations[cumDurations.length - 1] + d);
  return { durations, cumDurations, totalDuration: cumDurations[cumDurations.length - 1] };
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

export default function Player({ library }: { library: ReturnType<typeof useLibrary> }) {
  const titleRepair = useTitleRepair({
    enabled: library.enabled && !!library.user,
    hydrated: library.hydrated,
    entries: library.entries,
    restore: library.restore,
    capture: library.capture,
    flush: library.flush,
  });
  const playback = usePlaybackSession();
  const [inputUrl, setInputUrl] = useState("");
  const [current, setCurrent] = useState<LoadedChapter | null>(null);
  const [nextPrefetch, setNextPrefetch] = useState<LoadedChapter | null>(null);
  // Real segment durations for `current`, keyed by playlist URL (url + voice).
  const [realDurations, setRealDurations] = useState<{
    key: string;
    durations: Array<number | null>;
  } | null>(null);
  const timing = useMemo(
    () =>
      current
        ? buildTiming(
            current.chunks,
            realDurations?.key === current.playlistUrl ? realDurations.durations : null,
          )
        : null,
    [current, realDurations],
  );
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [playbackRate, setPlaybackRate] = useState<number>(1.15);
  const [readerFontSize, setReaderFontSize] = useState(18);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunkPosition, setChunkPosition] = useState(0);
  const [chunkDuration, setChunkDuration] = useState(0);
  const [readerLine, setReaderLine] = useState(1.75);
  const [readerFace, setReaderFace] = useState<ReaderFace>("serif");
  const [readerMargin, setReaderMargin] = useState<ReaderMargin>("medium");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sleep, setSleep] = useState<SleepMode>(null);
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);
  const theme = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>("reader");
  const [mediaLog, setMediaLog] = useState<MediaLogEntry[]>([]);
  // Navigation: a tab underneath, optionally covered by a chapter surface.
  const [tab, setTab] = useState<Tab>("home");
  const [surface, setSurface] = useState<"reader" | "player" | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  const [focusBook, setFocusBook] = useState<string | null>(null);
  // URL of the last chapter request whose text arrived; the add sheet waits on it.
  const [loadedRequest, setLoadedRequest] = useState("");
  // Cover image per book key ("" = looked up, none found).
  const [covers, setCovers] = useState<Record<string, string>>({});
  const coverLookupsRef = useRef(new Set<string>());

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaLogRef = useRef<MediaLogEntry[]>([]);
  const hlsRef = useRef<HlsLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const captureRef = useRef<() => void>(() => {});
  const readerPositionRef = useRef({ chunk: 0, offset: 0 });
  const recoveryAttemptsRef = useRef(0);
  const attachedUrlRef = useRef("");
  const cloudSleepRef = useRef<{ sleep: SleepMode; sessionId: string; rate: number; stop: number } | null>(null);
  const [readerRestore, setReaderRestore] = useState({ chunk: 0, offset: 0 });
  const [localHydrated, setLocalHydrated] = useState(false);
  const voiceAnchorRef = useRef<{ url: string; chunk: number; fraction: number } | null>(null);
  // Latch playback intent across the (single) chapter-boundary src swap so a
  // spurious `pause` event mid-swap can't drop us out of the playing state.
  const wantPlayRef = useRef(false);
  const didAutoResumeRef = useRef(false);
  // Hold the last chunk index at which sleep="chunk" arming began. We pause
  // when the index advances past that.
  const sleepChunkStartRef = useRef<number | null>(null);
  // Re-entry guard for chapter-boundary crossover. We chain the next chapter
  // into the HLS playlist so audio keeps playing when the PWA is backgrounded
  // (JS suspended). When JS resumes, `timeupdate`/`ended` can both observe an
  // overshoot — this ref ensures we only transition once per crossing.
  const transitioningRef = useRef(false);
  const positionSyncedAtRef = useRef(0);
  const reattachedAtRef = useRef(0);
  const continuingRef = useRef(false);
  const continueTimerRef = useRef<number | null>(null);

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
      if (!Number.isNaN(n)) setReaderFontSize(Math.max(FONT_MIN, Math.min(FONT_MAX, n)));
    }
    const savedLine = parseFloat(localStorage.getItem(LS_READER_LINE) || "");
    if (savedLine >= 1.3 && savedLine <= 2.2) setReaderLine(savedLine);
    const savedFace = localStorage.getItem(LS_READER_FACE);
    if (savedFace === "serif" || savedFace === "sans") setReaderFace(savedFace);
    const savedMargin = localStorage.getItem(LS_READER_MARGIN);
    if (savedMargin === "narrow" || savedMargin === "medium" || savedMargin === "wide") setReaderMargin(savedMargin);
    const savedView = localStorage.getItem(LS_VIEW_MODE);
    if (savedView) setViewMode(normalizeMode(savedView));
    try { setCovers(JSON.parse(localStorage.getItem(LS_COVERS) || "{}")); } catch {}
    setLocalHydrated(true);
  }, []);

  useEffect(() => { try { localStorage.setItem(LS_VOICE, voice); } catch {} }, [voice]);
  useEffect(() => { try { localStorage.setItem(LS_SPEED, String(playbackRate)); } catch {} }, [playbackRate]);
  useEffect(() => {
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(history)); } catch {}
  }, [history]);
  useEffect(() => {
    try { localStorage.setItem(LS_READER_FONT, String(readerFontSize)); } catch {}
  }, [readerFontSize]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_READER_LINE, String(readerLine));
      localStorage.setItem(LS_READER_FACE, readerFace);
      localStorage.setItem(LS_READER_MARGIN, readerMargin);
    } catch {}
  }, [readerLine, readerFace, readerMargin]);
  useEffect(() => { try { localStorage.setItem(LS_VIEW_MODE, viewMode); } catch {} }, [viewMode]);

  const persistMediaLog = useCallback(() => {
    try { localStorage.setItem(LS_MEDIA_LOG, JSON.stringify(mediaLogRef.current)); } catch {}
  }, []);

  const recordMedia = useCallback((event: string) => {
    const a = audioRef.current;
    let buf = -1;
    if (a && a.buffered.length > 0) {
      try { buf = a.buffered.end(a.buffered.length - 1); } catch { buf = -1; }
    }
    const entry: MediaLogEntry = {
      t: Date.now(),
      e: event,
      ct: a?.currentTime ?? -1,
      rs: a?.readyState ?? -1,
      ns: a?.networkState ?? -1,
      buf,
      ...(a?.error ? { err: `${a.error.code}:${a.error.message || ""}` } : {}),
    };
    const next = [...mediaLogRef.current, entry].slice(-MEDIA_LOG_CAP);
    mediaLogRef.current = next;
    setMediaLog(next);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_MEDIA_LOG);
      if (!raw) return;
      const parsed = JSON.parse(raw) as MediaLogEntry[];
      if (Array.isArray(parsed)) {
        mediaLogRef.current = parsed.slice(-MEDIA_LOG_CAP);
        setMediaLog(mediaLogRef.current);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEvent = (ev: Event) => recordMedia(ev.type);
    for (const name of MEDIA_LOG_EVENTS) a.addEventListener(name, onEvent);
    return () => { for (const name of MEDIA_LOG_EVENTS) a.removeEventListener(name, onEvent); };
  }, [recordMedia]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistMediaLog();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", persistMediaLog);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", persistMediaLog);
    };
  }, [persistMediaLog]);

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
  }, [sleep]);

  const cancelSleep = useCallback(() => {
    const a = audioRef.current;
    if (a && a.volume < 1) a.volume = 1;
    setSleep(null);
    setSleepRemainingMs(0);
  }, []);

  // Publish chapter-relative timing to the OS. A prepared session plays one
  // playlist covering several chapters, so the element's own duration is the
  // whole prepared run; iOS only shows an elapsed/remaining readout on the
  // lock screen and in Control Center if we report the chapter's bounds
  // ourselves. iOS extrapolates between calls, so the rate has to be included.
  const syncPositionState = useCallback(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const media = navigator.mediaSession;
    if (typeof media.setPositionState !== "function") return;
    const a = audioRef.current;
    if (!a || !current || current.audioPending || !timing) return;
    const duration = timing.totalDuration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const position = Math.max(0, Math.min(duration, a.currentTime - (current.startOffset ?? 0)));
    try {
      media.setPositionState({ duration, position, playbackRate: a.playbackRate || 1 });
    } catch {}
  }, [current, timing]);

  const fetchChapterMeta = useCallback(
    async (url: string, requestedVoice: string, signal?: AbortSignal): Promise<LoadedChapter> => {
      const res = await authorizedFetch(
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

  const cancelContinue = useCallback(() => {
    if (continueTimerRef.current !== null) {
      window.clearTimeout(continueTimerRef.current);
      continueTimerRef.current = null;
    }
  }, []);

  const attachSource = useCallback(async (playlistUrl: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    attachedUrlRef.current = playlistUrl;
    detachHls();
    const native = audio.canPlayType("application/vnd.apple.mpegurl");
    // Chrome may advertise native HLS but reject packed-MP3 segments. Keep
    // Apple's native pipeline for background playback and use hls.js elsewhere.
    const appleWebKit = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || navigator.vendor.includes("Apple")
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (native && appleWebKit) {
      audio.src = playlistUrl;
      audio.load();
      return;
    }
    try {
      const mod = await import("hls.js");
      if (attachedUrlRef.current !== playlistUrl) return;
      const Hls = (mod as unknown as { default: typeof import("hls.js").default }).default;
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, startPosition: pendingRestoreRef.current?.time ?? 0, maxBufferLength: 90 });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (++recoveryAttemptsRef.current > 3) {
            setError("Audio could not recover. Use Retry audio to continue.");
            setIsBuffering(false);
            return;
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(audio.currentTime);
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setError("Audio playback failed. Use Retry audio to continue.");
        });
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

  const coversRef = useRef(covers);
  useEffect(() => {
    coversRef.current = covers;
    try { localStorage.setItem(LS_COVERS, JSON.stringify(covers)); } catch {}
  }, [covers]);

  const pushHistory = useCallback((chapter: Chapter) => {
    const item: HistoryItem = {
      url: chapter.url,
      title: chapter.title,
      source: chapter.source,
      coverSeed: chapter.bookTitle || chapter.title,
      lastAt: Date.now(),
      bookTitle: chapter.bookTitle,
      chapterLabel: chapter.chapterLabel,
      bookId: bookKey(chapter),
      coverUrl: coversRef.current[bookKey(chapter)] || undefined,
    };
    setHistory((prev) => [item, ...prev.filter((p) => p.url !== item.url)]);
  }, []);

  const loadChapterFromUrl = useCallback(
    async (url: string, autoplay = false, requestedVoice = voice, keepText = false) => {
      captureRef.current();
      void library.flush();
      abortRef.current?.abort();
      prefetchAbortRef.current?.abort();
      cancelContinue();
      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      setChapterLoading(!keepText);
      setIsPlaying(false);
      setNextPrefetch(null);
      transitioningRef.current = false;
      wantPlayRef.current = autoplay;
      recoveryAttemptsRef.current = 0;
      audioRef.current?.pause();
      detachHls();
      attachedUrlRef.current = "";
      audioRef.current?.removeAttribute("src");
      audioRef.current?.load();
      pendingRestoreRef.current = null;
      setIsBuffering(false);
      if (keepText) setCurrent((previous) => previous ? { ...previous, audioPending: true, sessionId: undefined, playlistUrl: "" } : null);
      else setCurrent(null);
      let textLoaded = false;
      try {
        if (requestedVoice !== voice) { lastVoiceRef.current = requestedVoice; setVoice(requestedVoice); }
        let legacy: { time?: number; chunk?: number; offset?: number; voice?: string } = {};
        try { legacy = JSON.parse(localStorage.getItem(LS_POSITION_PREFIX + url) || "{}"); } catch {}
        const saved = library.restore(url);
        if (saved) writeLegacyPosition(saved);
        // Start both independently. A rejected audio job must never hide text
        // or become an unhandled rejection while the metadata request finishes.
        const preparation = library.enabled ? playback.prepare(url, requestedVoice, ac.signal)
          .then((loaded) => ({ loaded, error: null }), (error: unknown) => ({ loaded: null, error })) : null;
        const text = await fetchChapterMeta(url, requestedVoice, ac.signal);
        if (ac.signal.aborted) return;
        textLoaded = true;
        setLoadedRequest(url);
        const preview = library.enabled ? { ...text, audioPending: true, playlistUrl: "" } : text;
        setCurrent(preview);
        if (!keepText) {
          setCurrentChunkIndex(0);
          setChunkPosition(0);
          setChunkDuration(preview.chunks[0]?.estDuration ?? 0);
        }
        setChapterLoading(false);
        try { localStorage.setItem(LS_URL, url); } catch {}
        pushHistory(preview.chapter);
        const prepared = await preparation;
        if (ac.signal.aborted) return;
        if (prepared && !prepared.loaded) throw prepared.error;
        const loaded = prepared?.loaded ?? text;
        if (loaded.sessionId) {
          let time = saved?.voice === requestedVoice ? saved.audioTime : 0;
          if (!saved) {
            time = legacy.voice && legacy.voice !== requestedVoice ? 0 : legacy.time || 0;
          }
          if (!time && legacy.time === undefined && typeof legacy.chunk === "number") {
            const index = Math.max(0, Math.min(loaded.chunks.length - 1, legacy.chunk));
            time = loaded.cumDurations[index] + (legacy.offset || 0);
          }
          const anchor = voiceAnchorRef.current;
          if (anchor?.url === url) {
            const index = Math.min(anchor.chunk, loaded.chunks.length - 1);
            time = loaded.cumDurations[index] + loaded.chunks[index].estDuration * anchor.fraction;
            voiceAnchorRef.current = null;
          }
          const relative = Math.max(0, Math.min(time, loaded.totalDuration - 0.1));
          pendingRestoreRef.current = { chapter: url, time: (loaded.startOffset ?? 0) + relative, sessionId: loaded.sessionId, at: Date.now() };
        }
        setCurrent(loaded);
        if (autoplay) wantPlayRef.current = true;
        await attachSource(loaded.playlistUrl);
        setChapterLoading(false);
      } catch (err) {
        if (ac.signal.aborted || (err as Error).name === "AbortError") return;
        // Do not keep preparing an invisible chapter after a text fetch fails.
        if (!textLoaded && library.enabled) {
          ac.abort();
          void playback.close();
        }
        setChapterLoading(false);
        wantPlayRef.current = false;
        setError((err as Error).message);
      }
    },
    [attachSource, detachHls, cancelContinue, fetchChapterMeta, pushHistory, voice, library.enabled, library.restore, library.flush, playback.prepare, playback.close],
  );

  // Seamless transition to the chained next chapter without going through
  // /api/chapter-meta again (we already have the prefetched LoadedChapter).
  // The new playlist URL (chained B+C) replaces audio.src; we seek to `offset`
  // so playback resumes at the right spot. Used when boundary detection (in
  // onTimeUpdate / onEnded) observes that the audio is past the current
  // chapter's end — which happens when JS was suspended (PWA backgrounded)
  // while the chained HLS playlist played past the chapter boundary inline.
  const crossoverToNext = useCallback(
    async (next: LoadedChapter, offset: number) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      try {
        abortRef.current?.abort();
        prefetchAbortRef.current?.abort();
        setNextPrefetch(null);
        setCurrent(next);
        setCurrentChunkIndex(0);
        setChunkPosition(0);
        setChunkDuration(next.chunks[0]?.estDuration ?? 0);
        try { localStorage.setItem(LS_URL, next.chapter.url); } catch {}
        pushHistory(next.chapter);
        // Resume at the overshoot offset (clamped) once the new playlist's
        // metadata loads. wantPlay carries playback intent across the swap.
        const target = Math.max(0, Math.min(offset, next.totalDuration - 0.5));
        pendingRestoreRef.current = { chapter: next.chapter.url, time: target, sessionId: next.sessionId, at: Date.now() };
        wantPlayRef.current = true;
        await attachSource(next.playlistUrl);
      } finally {
        transitioningRef.current = false;
      }
    },
    [attachSource, pushHistory],
  );

  // First-mount auto-resume.
  useEffect(() => {
    if (didAutoResumeRef.current) return;
    if (!localHydrated) return;
    if (library.enabled && (!library.hydrated || !library.user)) return;
    const savedUrl = library.entries[0]?.url || localStorage.getItem(LS_URL);
    if (!savedUrl) return;
    didAutoResumeRef.current = true;
    const saved = library.restore(savedUrl);
    if (saved) setViewMode(normalizeMode(saved.mode));
    void loadChapterFromUrl(savedUrl, false, saved?.voice);
  }, [loadChapterFromUrl, localHydrated, library.enabled, library.hydrated, library.user, library.entries, library.restore]);

  useEffect(() => {
    if (!current) return;
    let position = { chunk: 0, offset: 0 };
    try { position = JSON.parse(localStorage.getItem(`nab:reader:${current.chapter.url}`) || JSON.stringify(position)); } catch {}
    readerPositionRef.current = position;
    setReaderRestore(position);
  }, [current?.chapter.url]);

  useEffect(() => {
    const restoreCloud = (event: Event) => {
      const p = (event as CustomEvent<ChapterProgress>).detail;
      if (p.chapterUrl === current?.chapter.url) {
        // Do not recapture the losing position while applying an explicit choice.
        captureRef.current = () => {};
        setViewMode(normalizeMode(p.mode));
        void loadChapterFromUrl(p.chapterUrl, false, p.voice);
      }
    };
    window.addEventListener("nab:restore-cloud", restoreCloud);
    return () => window.removeEventListener("nab:restore-cloud", restoreCloud);
  }, [current?.chapter.url, loadChapterFromUrl]);

  // Reload chapter when voice changes mid-session (server cache keyed by voice).
  // Only fires if a chapter is already loaded and the voice actually changed.
  const lastVoiceRef = useRef(voice);
  useEffect(() => {
    if (lastVoiceRef.current === voice) return;
    lastVoiceRef.current = voice;
    if (!current) return;
    if (timing && audioRef.current && !current.audioPending) {
      const time = Math.max(0, audioRef.current.currentTime - (current.startOffset ?? 0));
      const chunk = findChunkAtTime(timing.cumDurations, time);
      voiceAnchorRef.current = { url: current.chapter.url, chunk,
        fraction: Math.max(0, Math.min(1, (time - timing.cumDurations[chunk]) / (timing.durations[chunk] || 1))) };
    }
    void loadChapterFromUrl(current.chapter.url, isPlaying);
  }, [voice, current, isPlaying, loadChapterFromUrl]);

  // Pre-warm next chapter's parse + segment cache on the server. We only need
  // the meta to know it's valid; segments synth lazy on transition.
  useEffect(() => {
    if (library.enabled) return;
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
  }, [current, nextPrefetch, fetchChapterMeta, voice, library.enabled]);

  // Restore saved position once chapter is attached + metadata loaded. A
  // prepared session is one playlist spanning several chapters, so its pending
  // time is absolute on that session's timeline and stays valid whichever
  // chapter happens to be current when the metadata arrives.
  const pendingRestoreRef = useRef<PendingRestore | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!current?.sessionId || !audio || chapterLoading || !timing) return;
    let url = current.playlistUrl;
    if (sleep) {
      const previous = cloudSleepRef.current;
      const unchanged = previous?.sleep === sleep && previous.sessionId === current.sessionId && previous.rate === playbackRate;
      const stop = unchanged ? previous.stop : sleep.kind === "chapter"
        ? (current.startOffset ?? 0) + timing.totalDuration
        : sleep.kind === "chunk"
          ? (current.startOffset ?? 0) + timing.cumDurations[currentChunkIndex + 1]
          : audio.currentTime + Math.max(0.1, (sleep.endsAt - Date.now()) / 1000) * playbackRate;
      cloudSleepRef.current = { sleep, sessionId: current.sessionId, rate: playbackRate, stop };
      url += `&stop=${stop}`;
    } else cloudSleepRef.current = null;
    if (url === attachedUrlRef.current) return;
    pendingRestoreRef.current = { chapter: current.chapter.url, time: audio.currentTime, sessionId: current.sessionId, at: Date.now() };
    wantPlayRef.current = !audio.paused;
    void attachSource(url);
  }, [sleep, playbackRate, current, timing, currentChunkIndex, chapterLoading, attachSource]);
  useEffect(() => {
    if (!current || current.sessionId || current.audioPending) return;
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
      // Estimates can undershoot the real length a little, so allow some slack.
      if (time > 0 && time < current.totalDuration * 1.15) {
        pendingRestoreRef.current = { chapter: current.chapter.url, time, at: Date.now() };
      }
    } catch {}
  }, [current]);

  // Poll the server for real segment durations while playing. The player
  // buffers ahead, so the last segment's true length is known well before the
  // chapter boundary, letting the crossover fire exactly when the chained next
  // chapter starts instead of minutes late (which replayed its opening).
  useEffect(() => {
    if (!current || current.sessionId || current.audioPending || !isPlaying) return;
    const key = current.playlistUrl;
    const url = `/api/chapter-durations?url=${encodeURIComponent(current.chapter.url)}&voice=${encodeURIComponent(current.voice)}`;
    const ac = new AbortController();
    let done = false;
    const poll = async () => {
      if (done) return;
      try {
        const res = await fetch(url, { cache: "no-store", signal: ac.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; durations?: Array<number | null> };
        if (!data.ok || !data.durations) return;
        const durations = data.durations;
        done = durations.every((d) => d !== null);
        setRealDurations((prev) =>
          prev?.key === key &&
          prev.durations.length === durations.length &&
          prev.durations.every((d, i) => d === durations[i])
            ? prev
            : { key, durations },
        );
      } catch {}
    };
    void poll();
    const id = window.setInterval(poll, 10_000);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, [current, isPlaying]);

  // Re-attach the playlist at the position we had reached. iOS reports nothing
  // at all when its native HLS engine gives up mid-stream on a locked phone —
  // no `error`, no `ended`, and `paused` stays false — so re-attaching is the
  // only way back short of relaunching the app.
  const recoverPlayback = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !current || current.audioPending || chapterLoading) return;
    const url = attachedUrlRef.current || current.playlistUrl;
    if (!url) return;
    reattachedAtRef.current = Date.now();
    pendingRestoreRef.current = { chapter: current.chapter.url, time: a.currentTime, sessionId: current.sessionId, at: Date.now() };
    wantPlayRef.current = true;
    setStalled(false);
    await attachSource(url);
  }, [current, chapterLoading, attachSource]);

  // A prepared playlist is closed at whatever was ready when we attached it, so
  // `ended` also fires when the session has since run further ahead. Re-read the
  // playlist and carry on from the same point when later chapters have landed.
  // Synthesis of the next chapter can easily outlast the moment we arrive here,
  // so keep checking on a backoff until the session says it is finished.
  const continuePreparedSession: (attempt?: number) => Promise<boolean> = useCallback(async (attempt = 0) => {
    const a = audioRef.current;
    if (!a || !current?.sessionId || continuingRef.current) return false;
    continuingRef.current = true;
    try {
      const reached = a.currentTime;
      const updated = await playback.refresh().catch(() => null);
      const last = updated?.chapters.at(-1);
      if (!last || last.start + last.duration <= reached + 0.5) {
        // `terminal` is the only signal that no further chapter is coming; a
        // failed refresh is a reason to retry, not to give up.
        const stillComing = !updated || !updated.terminal;
        if (stillComing && attempt < MAX_CONTINUE_ATTEMPTS) {
          cancelContinue();
          continueTimerRef.current = window.setTimeout(() => {
            continueTimerRef.current = null;
            void continuePreparedSession(attempt + 1);
          }, CONTINUE_RETRY_MS[Math.min(attempt, CONTINUE_RETRY_MS.length - 1)]);
        }
        return false;
      }
      cancelContinue();
      reattachedAtRef.current = Date.now();
      pendingRestoreRef.current = { chapter: current.chapter.url, time: reached, sessionId: current.sessionId, at: Date.now() };
      wantPlayRef.current = true;
      await attachSource(attachedUrlRef.current || current.playlistUrl);
      return true;
    } finally {
      continuingRef.current = false;
    }
  }, [current, attachSource, playback.refresh, cancelContinue]);

  // Retries belong to the session that queued them.
  useEffect(() => cancelContinue, [current?.sessionId, cancelContinue]);

  // Auto-advance to next chapter on end.
  const onEnded = useCallback(() => {
    if (!current || current.audioPending || chapterLoading) return;
    captureRef.current();
    void library.flush();
    if (current.sessionId) {
      wantPlayRef.current = false;
      setIsPlaying(false);
      // A sleep timer truncates the playlist, so reaching its end means the
      // timer fired rather than that we ran out of prepared audio.
      if (sleep) {
        setSleep(null);
        return;
      }
      void continuePreparedSession();
      return;
    }
    if (sleep?.kind === "chapter") {
      wantPlayRef.current = false;
      setIsPlaying(false);
      setSleep(null);
      return;
    }
    const a = audioRef.current;
    // Crossover catch-up: if the chained playlist played past the chapter
    // boundary while JS was suspended (PWA backgrounded), `ended` may fire
    // before `timeupdate` had a chance to swap state. In that case the
    // prefetched next chapter is the chapter we just finished — advance to
    // *its* nextUrl instead of replaying it.
    const total = timing?.totalDuration ?? current.totalDuration;
    if (a && nextPrefetch && a.currentTime > total + 0.25) {
      void crossoverToNext(nextPrefetch, a.currentTime - total);
      return;
    }
    if (current.chapter.nextUrl) {
      wantPlayRef.current = true;
      void loadChapterFromUrl(current.chapter.nextUrl, true);
      return;
    }
    setIsPlaying(false);
  }, [current, timing, sleep, loadChapterFromUrl, nextPrefetch, crossoverToNext, library.flush, chapterLoading, continuePreparedSession]);

  const togglePlay = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !current || current.audioPending) return;
    // A stalled element is not paused, so without this the Play button would
    // pause a stream that has already stopped making sound.
    if (stalled && !a.paused) {
      await recoverPlayback();
      return;
    }
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
  }, [current, stalled, recoverPlayback]);

  const seekAbsolute = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a || current?.audioPending) return;
    a.currentTime = (current?.startOffset ?? 0) + Math.max(0, t);
    captureRef.current();
    syncPositionState();
  }, [current?.startOffset, current?.audioPending, syncPositionState]);

  const seekSeconds = useCallback(
    (delta: number) => {
      const a = audioRef.current;
      if (!a || !timing) return;
      const newT = a.currentTime - (current?.startOffset ?? 0) + delta;
      seekAbsolute(Math.min(Math.max(0, newT), timing.totalDuration - 0.1));
    },
    [timing, seekAbsolute, current?.startOffset],
  );

  const onPickChunk = useCallback(
    (i: number) => {
      if (!current || !timing) return;
      const idx = Math.max(0, Math.min(current.chunks.length - 1, i));
      if (current.audioPending) {
        setCurrentChunkIndex(idx);
        readerPositionRef.current = { chunk: idx, offset: 0 };
        return;
      }
      seekAbsolute(timing.cumDurations[idx]);
    },
    [current, timing, seekAbsolute],
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
    navigator.mediaSession.setActionHandler("play", () => {
      if (current.audioPending) return;
      const a = audioRef.current;
      if (stalled && a && !a.paused) { void recoverPlayback(); return; }
      void a?.play();
    });
    navigator.mediaSession.setActionHandler("pause", () => { wantPlayRef.current = false; audioRef.current?.pause(); });
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
  }, [current, togglePlay, goPrevChapter, goNextChapter, seekSeconds, seekAbsolute, stalled, recoverPlayback]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    syncPositionState();
  }, [isPlaying, playbackRate, syncPositionState]);

  // Save chapter-relative time even after multiple background transitions.
  useEffect(() => {
    captureRef.current = () => {
      if (!current || chapterLoading) return;
      const queued = pendingRestoreRef.current;
      if (queued && Date.now() - queued.at < PENDING_RESTORE_GRACE_MS) return;
      const a = audioRef.current;
      if (!a) return;
      const active = current.sessionId ? playback.atTime(a.currentTime) : current;
      if (!active) return; // Wait for the durable timeline after background catch-up.
      const saved = library.restore(active.chapter.url);
      const time = active.audioPending ? saved?.audioTime ?? 0
        : Math.max(0, Math.min(active.totalDuration, a.currentTime - (active.startOffset ?? 0)));
      const p: ChapterProgress = {
        chapterUrl: active.chapter.url, bookKey: bookKey(active.chapter), title: active.chapter.title,
        bookTitle: active.chapter.bookTitle, chapterLabel: active.chapter.chapterLabel, source: active.chapter.source,
        mode: a.paused ? viewMode : "audio", audioTime: Number(time.toFixed(3)), voice: active.audioPending ? saved?.voice ?? active.voice : active.voice,
        readerChunk: active.chapter.url === current.chapter.url ? readerPositionRef.current.chunk : saved?.readerChunk ?? 0,
        readerOffset: active.chapter.url === current.chapter.url ? readerPositionRef.current.offset : saved?.readerOffset ?? 0,
        wordIndex: saved?.wordIndex ?? 0,
        coverUrl: coversRef.current[bookKey(active.chapter)] || saved?.coverUrl,
      };
      try {
        writeLegacyPosition(p);
        localStorage.setItem(LS_URL, p.chapterUrl);
      } catch {}
      library.capture(p);
    };
  }, [current, chapterLoading, viewMode, playback.atTime, library.capture, library.restore]);

  useEffect(() => {
    const save = () => captureRef.current();
    const t = setInterval(save, 3000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { save(); void library.flush(); }
    };
    const onHide = () => { save(); void library.flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [library.flush]);

  const onLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current || current.audioPending || chapterLoading) return;
    a.playbackRate = playbackRate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    // Consume the restore unconditionally. Leaving a non-matching one queued
    // used to suppress progress capture for the rest of the run, so a later
    // launch resumed from an hour-old position.
    const pending = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    if (restoreApplies(pending, { chapter: current.chapter.url, sessionId: current.sessionId })) {
      try {
        a.currentTime = pending!.time;
      } catch {}
    }
    syncPositionState();
    if (wantPlayRef.current) {
      wantPlayRef.current = false;
      a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [current, playbackRate, chapterLoading, syncPositionState]);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current || current.audioPending || !timing) return;
    if (transitioningRef.current) return;
    let active = current;
    if (current.sessionId) {
      const next = playback.atTime(a.currentTime);
      if (!next) return;
      if (next && next.chapter.url !== current.chapter.url) {
        captureRef.current();
        active = next;
        setCurrent(next);
        pushHistory(next.chapter);
        void library.flush();
      }
    }
    const t = a.currentTime - (active.startOffset ?? 0);
    const activeTiming = active === current ? timing : buildTiming(active.chunks, null);
    // Chapter boundary: the chained HLS playlist has played past the end of
    // the current chapter (typical when the PWA was backgrounded). Swap to
    // the prefetched next chapter, seeking to the overshoot offset.
    if (!current.sessionId && t > timing.totalDuration + 0.25 && nextPrefetch) {
      void crossoverToNext(nextPrefetch, t - timing.totalDuration);
      return;
    }
    const idx = findChunkAtTime(activeTiming.cumDurations, t);
    setChunkPosition(t - activeTiming.cumDurations[idx]);
    setChunkDuration(activeTiming.durations[idx] ?? 0);
    // `timeupdate` fires several times a second; the OS only needs an anchor it
    // can extrapolate from.
    if (Date.now() - positionSyncedAtRef.current > 1000) {
      positionSyncedAtRef.current = Date.now();
      syncPositionState();
    }
    if (idx !== currentChunkIndex) {
      setCurrentChunkIndex(idx);
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
  }, [current, timing, currentChunkIndex, sleep, nextPrefetch, crossoverToNext, playback.atTime, pushHistory, library.flush, syncPositionState]);

  useEffect(() => {
    if (!current?.sessionId) return;
    onTimeUpdate();
    // We stopped at the end of the prepared run and the session has since
    // prepared more. Re-attach now: calling play() on an ended element would
    // restart the whole run from the beginning.
    if (audioRef.current?.ended) void continuePreparedSession();
  }, [playback.session?.chapters.length, onTimeUpdate, current?.sessionId, continuePreparedSession]);

  // Stall watchdog. Timers are frozen while the phone is locked, so the first
  // tick after the app comes back is what matters: if the element still claims
  // to be playing but its clock has not moved, the native player died while we
  // were suspended and only a re-attach will bring the audio back.
  const progressRef = useRef({ time: -1, at: 0 });
  useEffect(() => {
    if (!isPlaying || !current || current.audioPending || chapterLoading) {
      setStalled(false);
      return;
    }
    progressRef.current = { time: audioRef.current?.currentTime ?? -1, at: Date.now() };
    const inspect = () => {
      const a = audioRef.current;
      if (!a || a.paused || a.ended) return;
      // Give a re-attach time to land, but never longer: if it silently fails
      // to produce audio the watchdog has to be free to try again.
      if (Date.now() - reattachedAtRef.current < STALL_TIMEOUT_MS) return;
      const seen = progressRef.current;
      if (a.currentTime > seen.time + 0.05) {
        progressRef.current = { time: a.currentTime, at: Date.now() };
        // Sustained progress means earlier hiccups are behind us; otherwise a
        // long listen eventually exhausts the retry budget and gives up.
        recoveryAttemptsRef.current = 0;
        setStalled(false);
        return;
      }
      if (Date.now() - seen.at < STALL_TIMEOUT_MS) return;
      progressRef.current = { time: a.currentTime, at: Date.now() };
      setStalled(true);
      void recoverPlayback();
    };
    const id = window.setInterval(inspect, 2000);
    const onVisible = () => { if (document.visibilityState === "visible") inspect(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isPlaying, current, chapterLoading, recoverPlayback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.closest?.("[role=dialog]")
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
    if (!timing || timing.totalDuration <= 0) return 0;
    const a = audioRef.current;
    const t = a ? Math.max(0, a.currentTime - (current?.startOffset ?? 0)) : timing.cumDurations[currentChunkIndex] + chunkPosition;
    return Math.min(100, (t / timing.totalDuration) * 100);
  }, [current, currentChunkIndex, chunkPosition]);

  // Look up a cover once per book. The server finds it and hands back a
  // signed image URL; "" records a miss so we don't ask again.
  useEffect(() => {
    if (!current) return;
    const key = bookKey(current.chapter);
    if (key in covers || coverLookupsRef.current.has(key)) return;
    coverLookupsRef.current.add(key);
    const title = current.chapter.bookTitle || current.chapter.title;
    void (async () => {
      try {
        const res = await authorizedFetch(`/api/cover?url=${encodeURIComponent(current.chapter.url)}&title=${encodeURIComponent(title)}`);
        const data = (await res.json()) as { ok: boolean; cover?: string | null };
        if (!res.ok || !data.ok) return;
        setCovers((prev) => ({ ...prev, [key]: data.cover || "" }));
        if (data.cover) {
          setHistory((prev) => prev.map((h) => (h.bookId === key && !h.coverUrl ? { ...h, coverUrl: data.cover! } : h)));
        }
      } catch {}
    })();
  }, [current, covers]);

  const libraryHistory = useMemo(() => {
    const items = library.enabled ? library.entries : history;
    return items.map((item) => (item.coverUrl || !item.bookId || !covers[item.bookId] ? item : { ...item, coverUrl: covers[item.bookId] }));
  }, [library.enabled, library.entries, history, covers]);
  const books = useMemo(() => groupHistoryByBook(libraryHistory), [libraryHistory]);
  const currentBook = current ? books.find((b) => b.chapters.some((c) => c.url === current.chapter.url)) : undefined;

  const openSurface = useCallback((next: "reader" | "player" | null) => {
    setSurface(next);
    if (next === "reader") setViewMode("reader");
    else if (next === "player") setViewMode("audio");
  }, []);

  useEffect(() => {
    if (!current && !chapterLoading) setSurface(null);
  }, [current, chapterLoading]);

  useEffect(() => {
    if (surface !== "player") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=dialog]")) openSurface(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surface, openSurface]);

  const pickHistory = (url: string, options: { play?: boolean; surface?: "reader" | "player" } = {}) => {
    if (current?.chapter.url === url && !chapterLoading) {
      openSurface(options.surface ?? "reader");
      if (options.play && !isPlaying && !current.audioPending) void togglePlay();
      return;
    }
    captureRef.current();
    const saved = library.restore(url);
    setInputUrl(url);
    openSurface(options.surface ?? (saved && normalizeMode(saved.mode) === "audio" ? "player" : "reader"));
    void loadChapterFromUrl(url, !!options.play, saved?.voice);
  };

  const retryAudio = async () => {
    setError(null);
    if (playback.session) await authorizedFetch(`/api/playback-sessions/${playback.session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) });
    void loadChapterFromUrl(current?.chapter.url || inputUrl, isPlaying, voice, !!current);
  };

  const listenFromHere = async () => {
    const a = audioRef.current;
    if (!a || !current || current.audioPending) return;
    // Only move the audio when the page has moved on from the part it is at,
    // so a paused chapter resumes where it stopped.
    const chunk = readerPositionRef.current.chunk;
    if (chunk !== currentChunkIndex) onPickChunk(chunk);
    if (a.paused) await togglePlay();
  };

  const pause = () => {
    wantPlayRef.current = false;
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const signOut = async () => {
    captureRef.current();
    await library.flush();
    abortRef.current?.abort();
    audioRef.current?.pause();
    await playback.close();
    detachHls();
    audioRef.current?.removeAttribute("src");
    audioRef.current?.load();
    setCurrent(null); setIsPlaying(false); setChapterLoading(false);
    setSurface(null); setTab("home");
    await library.signOut();
    didAutoResumeRef.current = false;
  };

  const audioFailed = !!playback.error || (!!error && library.enabled && !!current);
  const audioState: AudioState = !current ? "none"
    : audioFailed ? "failed"
    : current.audioPending || playback.preparing ? "preparing"
    : isPlaying ? "playing" : "ready";
  const audioMessage = playback.error || error;

  const elapsed = timing ? Math.max(0, (timing.cumDurations[currentChunkIndex] ?? 0) + chunkPosition) : 0;
  const nowPlaying: NowPlaying | null = current ? {
    url: current.chapter.url,
    title: current.chapter.title,
    chapterLabel: current.chapter.chapterLabel,
    bookTitle: currentBook?.title || current.chapter.bookTitle || current.chapter.title,
    source: current.chapter.source,
    coverSeed: currentBook?.coverSeed || current.chapter.bookTitle || current.chapter.title,
    coverUrl: currentBook?.coverUrl || covers[bookKey(current.chapter)] || undefined,
    elapsed,
    duration: current.audioPending ? 0 : timing?.totalDuration ?? 0,
    percent: progressPercent,
  } : null;

  const narration: NarrationSummary | null = !current || !library.enabled || (!playback.session && !playback.preparing && !playback.error) ? null : {
    title: `${nowPlaying!.bookTitle} · ${current.chapter.chapterLabel || current.chapter.title}`,
    detail: playback.error ? "Narration stopped · open the chapter to retry"
      : playback.preparing || current.audioPending ? "Preparing audio · you can read while you wait"
      : `${playback.session?.chapters.length ?? 0} ${playback.session?.chapters.length === 1 ? "chapter" : "chapters"} narrated${playback.session?.terminal ? "" : " so far"}`,
    done: !!playback.session?.terminal && !playback.preparing,
    failed: !!playback.error,
  };

  const statusBanner = (() => {
    if (!current) return null;
    if (audioFailed) {
      return (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-[var(--color-failed-soft)] py-1.5 pl-3.5 pr-1.5 text-[13px] text-[var(--color-text)]">
          <AlertIcon size={17} className="shrink-0 text-[var(--color-failed)]" />
          <span className="min-w-0 flex-1 leading-snug">{audioMessage}{current.audioPending && " You can keep reading."}</span>
          <button type="button" className="h-10 shrink-0 rounded-xl px-3 font-semibold text-[var(--color-failed)] hover:bg-[var(--color-hover)]" onClick={() => void retryAudio()}>Retry audio</button>
        </div>
      );
    }
    if (playback.preparing) {
      return (
        <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-working-soft)] px-3.5 py-2.5 text-[13px] text-[var(--color-working)]">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-working)] animate-tome-pulse" />
          Preparing audio · you can read while you wait.
        </p>
      );
    }
    if (current.sessionId && !current.audioPending && !isPlaying && !error) {
      return (
        <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-ready-soft)] px-3.5 py-2.5 text-[13px] text-[var(--color-ready)]">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ready)]" />
          Audio ready · press Play whenever you like.
        </p>
      );
    }
    return null;
  })();

  const voiceName = VOICES.find((v) => v.id === voice)?.label.split(" (")[0] ?? voice;
  const readerPrefs: ReaderPrefs = { fontSize: readerFontSize, lineHeight: readerLine, face: readerFace, margin: readerMargin };
  const setReaderPrefs = (next: ReaderPrefs) => {
    setReaderFontSize(next.fontSize);
    setReaderLine(next.lineHeight);
    setReaderFace(next.face);
    setReaderMargin(next.margin);
  };
  const nextLabel = (() => {
    const label = current?.chapter.chapterLabel;
    const match = label?.match(/(\d+)/);
    return match ? `Ch. ${Number(match[1]) + 1}` : undefined;
  })();
  const showToast = !!error && !addOpen && !(library.enabled && current);
  const goTab = (next: Tab) => {
    openSurface(null);
    setTab(next);
    if (next !== "library") setFocusBook(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <NavRail tab={surface ? null : tab} onTab={goTab} onAdd={() => setAddOpen(true)} theme={theme.resolved} />

      <main className="lg:pl-[88px]">
        <div inert={!!surface} aria-hidden={surface ? true : undefined}
          className="pt-safe mx-auto w-full max-w-[720px] px-5 pb-[172px] pt-6 lg:px-10 lg:pb-32 lg:pt-12">
          {tab === "home" && (
            <HomeScreen
              books={books}
              nowPlaying={nowPlaying}
              narration={narration}
              onResume={(url) => pickHistory(url, { play: true, surface: "player" })}
              onRead={(url) => pickHistory(url, { surface: "reader" })}
              onAdd={() => setAddOpen(true)}
              onOpenLibrary={() => goTab("library")}
            />
          )}
          {tab === "library" && (
            <LibraryScreen
              books={books}
              currentUrl={current?.chapter.url}
              currentStatus={audioState === "failed" ? { status: "failed", label: "Audio failed" }
                : audioState === "preparing" ? { status: "working", label: "Preparing audio" }
                : audioState === "none" ? null : { status: "ready", label: "Audio ready" }}
              focusKey={focusBook}
              banner={library.conflict ? (
                <div role="alert" className="rounded-2xl bg-[var(--color-working-soft)] p-4 text-sm">
                  <p className="font-medium">Another device saved a different stopping point.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="h-10 rounded-xl bg-[var(--color-accent)] px-4 text-[13px] font-semibold text-[var(--color-on-accent)]" onClick={() => library.resolve(false)}>Use saved position</button>
                    <button type="button" className="h-10 rounded-xl border border-[var(--color-border-strong)] px-4 text-[13px] font-semibold" onClick={() => library.resolve(true)}>Keep this device</button>
                  </div>
                </div>
              ) : undefined}
              onPick={(url) => pickHistory(url)}
              onResume={(url) => pickHistory(url, { play: true, surface: "player" })}
              onAdd={() => setAddOpen(true)}
            />
          )}
          {tab === "search" && (
            <SearchScreen
              books={books}
              openChapter={current ? { title: current.chapter.chapterLabel || current.chapter.title, chunks: current.chunks } : null}
              onPickChapter={(url) => pickHistory(url, { surface: "reader" })}
              onPickBook={(key) => { setFocusBook(key); goTab("library"); setFocusBook(key); }}
              onPickChunk={(i) => {
                readerPositionRef.current = { chunk: i, offset: 0 };
                setReaderRestore({ chunk: i, offset: 0 });
                if (current?.audioPending || !isPlaying) setCurrentChunkIndex(i);
                openSurface("reader");
              }}
            />
          )}
          {tab === "you" && (
            <YouScreen
              account={{
                enabled: library.enabled,
                ready: library.ready,
                email: library.user?.email,
                status: titleRepair.status ?? library.status,
                conflict: library.conflict,
                bookCount: books.length,
                onSignOut: signOut,
                onResolve: library.resolve,
              }}
              voice={voice}
              voices={VOICES}
              onVoice={setVoice}
              playbackRate={playbackRate}
              onPlaybackRate={setPlaybackRate}
              prefs={readerPrefs}
              onPrefs={setReaderPrefs}
              theme={theme.preference}
              onTheme={theme.setPreference}
              mediaLog={mediaLog}
              onClearMediaLog={() => {
                mediaLogRef.current = [];
                setMediaLog([]);
                try { localStorage.removeItem(LS_MEDIA_LOG); } catch {}
              }}
            />
          )}
        </div>

        {surface && (
          <div className="fixed inset-0 z-40 bg-[var(--color-bg)] lg:left-[88px]">
            {chapterLoading || !current ? (
              <div className="pt-safe h-full overflow-y-auto">
                <div className="flex h-14 items-center px-2">
                  <button type="button" onClick={() => openSurface(null)} className="h-11 rounded-full px-4 text-sm font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-hover)]">Close</button>
                </div>
                <LoadingSkeleton />
              </div>
            ) : surface === "reader" ? (
              <ReaderScreen
                chapterKey={current.chapter.url}
                bookTitle={nowPlaying!.bookTitle}
                chapterLabel={current.chapter.chapterLabel}
                chapterTitle={current.chapter.title}
                source={current.chapter.source}
                chunks={current.chunks}
                currentChunkIndex={currentChunkIndex}
                prefs={readerPrefs}
                audio={audioState}
                followAudio={isPlaying}
                restorePosition={readerRestore}
                onPosition={(position) => { readerPositionRef.current = position; }}
                status={statusBanner}
                totalSeconds={(timing?.totalDuration ?? current.totalDuration) / (playbackRate || 1)}
                canPrev={!!current.chapter.prevUrl}
                canNext={!!current.chapter.nextUrl}
                nextLabel={nextLabel}
                onPickChunk={onPickChunk}
                onReachedEnd={() => {
                  const nextUrl = current.chapter.nextUrl;
                  if (!nextUrl) return;
                  void loadChapterFromUrl(nextUrl, isPlaying);
                }}
                onBack={() => openSurface(null)}
                onChapters={() => { setFocusBook(currentBook?.key ?? null); goTab("library"); setFocusBook(currentBook?.key ?? null); }}
                onPrev={goPrevChapter}
                onNext={goNextChapter}
                onListen={() => void listenFromHere()}
                onPause={pause}
                onOpenPlayer={() => openSurface("player")}
                onSettings={() => setReaderSettingsOpen(true)}
              />
            ) : (
              <NowPlayingScreen
                nowPlaying={nowPlaying!}
                voiceName={voiceName}
                canPlay={!current.audioPending && !chapterLoading}
                isPlaying={isPlaying}
                isBuffering={isBuffering}
                hasError={!!error}
                status={statusBanner}
                canPrev={!!current.chapter.prevUrl}
                canNext={!!current.chapter.nextUrl}
                nextReady={!!current.sessionId && !!playback.session?.chapters.some((c) => c.chapter.url === current.chapter.nextUrl)}
                parts={{ current: currentChunkIndex + 1, total: current.chunks.length }}
                onClose={() => openSurface(null)}
                onTogglePlay={() => void togglePlay()}
                onSeek={seekAbsolute}
                onSkip={seekSeconds}
                onPrev={goPrevChapter}
                onNext={goNextChapter}
                onPickPart={onPickChunk}
                onRead={() => openSurface("reader")}
                sleep={sleep}
                sleepRemainingMs={sleepRemainingMs}
                onSleepSet={setSleep}
                onSleepCancel={cancelSleep}
                playbackRate={playbackRate}
                onPlaybackRate={setPlaybackRate}
              />
            )}
          </div>
        )}
      </main>

      {nowPlaying && !surface && (
        <div className="fixed inset-x-2.5 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-30 lg:bottom-5 lg:left-[calc(88px+1.25rem)] lg:right-5">
          <div className="mx-auto max-w-[680px]">
            <MiniPlayer
              nowPlaying={nowPlaying}
              audio={audioState}
              isBuffering={isBuffering}
              errorText={audioMessage}
              onOpen={() => openSurface("player")}
              onTogglePlay={() => void togglePlay()}
              onRead={() => openSurface("reader")}
              onRetry={() => void retryAudio()}
            />
          </div>
        </div>
      )}

      {!surface && <BottomNav tab={tab} onTab={goTab} onAdd={() => setAddOpen(true)} />}

      {showToast && <Toast message={error!} onClose={() => setError(null)} />}

      {shortcutsOpen && (
        <div role="dialog" aria-label="Keyboard shortcuts" className="fixed bottom-6 right-6 z-[60] hidden w-64 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 text-[13px] shadow-[0_20px_40px_-12px_var(--color-shadow)] sm:block">
          <p className="eyebrow mb-3">Shortcuts</p>
          <div className="grid gap-1.5 text-[var(--color-muted)]">
            <div>Space — Play/Pause</div>
            <div>Arrow Left/Right — −/+ 15s</div>
            <div>[ / ] — Previous/Next chapter</div>
            <div>? — Toggle this help</div>
          </div>
        </div>
      )}

      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        url={inputUrl}
        onUrl={setInputUrl}
        loading={chapterLoading}
        error={error}
        loadedUrl={loadedRequest}
        onSubmit={(url) => { setLoadedRequest(""); void loadChapterFromUrl(url, false); }}
        onLoaded={() => { setAddOpen(false); openSurface("reader"); }}
      />

      <ReaderSettingsSheet
        open={readerSettingsOpen}
        onClose={() => setReaderSettingsOpen(false)}
        prefs={readerPrefs}
        onPrefs={setReaderPrefs}
        theme={theme.preference}
        onTheme={theme.setPreference}
      />

      <audio
        ref={audioRef}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
          // Audio is coming out of the speaker, so whatever went wrong before
          // is behind us. Without this a long listen slowly exhausts the
          // budget on unrelated hiccups and then refuses to recover at all.
          recoveryAttemptsRef.current = 0;
        }}
        onPause={() => {
          captureRef.current();
          void library.flush();
          if (wantPlayRef.current) return;
          setIsPlaying(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onError={() => {
          setIsBuffering(false);
          if (!current || current.audioPending || !attachedUrlRef.current) return;
          // Preparing a session closes the previous one, so a re-attach that
          // raced a reload is loading a manifest that now returns 410. Retry
          // against the live playlist instead of spending the recovery budget
          // on a URL that can never load.
          const stale = !!current.playlistUrl && !attachedUrlRef.current.startsWith(current.playlistUrl);
          if (!stale && ++recoveryAttemptsRef.current > 3) { setError("Playback interrupted. Use Retry audio to continue."); return; }
          pendingRestoreRef.current = { chapter: current.chapter.url, time: audioRef.current?.currentTime ?? 0, sessionId: current.sessionId, at: Date.now() };
          wantPlayRef.current = isPlaying;
          void attachSource(stale ? current.playlistUrl : (attachedUrlRef.current || current.playlistUrl));
        }}
        preload="auto"
        playsInline
      />
    </div>
  );
}
