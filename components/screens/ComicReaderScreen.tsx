"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { AlertIcon, ChevronLeftIcon, ExpandIcon, ListIcon, NextChapterIcon, PrevChapterIcon, RetryIcon, ShrinkIcon } from "@/components/ui/icons";
import { Button, IconButton } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/player/LoadingSkeleton";
import { useComic } from "@/lib/comics/useComic";
import { chapterProgress, locate, readLocalPosition, scrollFor, writeLocalPosition, type ComicPosition } from "@/lib/comics/position";
import type { ComicChapter } from "@/lib/comics/types";
import type { ChapterProgress } from "@/lib/library/types";
import type { HistoryItem } from "@/components/player/types";

const SAVE_EVERY_MS = 1500;

function toProgress(c: ComicChapter, pos: ComicPosition): ChapterProgress {
  return {
    chapterUrl: c.url, bookKey: c.bookId, title: c.bookTitle, bookTitle: c.bookTitle, chapterLabel: c.chapterLabel,
    source: c.source, mode: "reader", audioTime: 0, voice: "", readerChunk: pos.page, readerOffset: pos.offset,
    wordIndex: 0, coverUrl: c.coverUrl, kind: "comic", pageCount: c.pages.length,
  };
}

function toHistory(c: ComicChapter, pos: ComicPosition): HistoryItem {
  return {
    url: c.url, title: c.bookTitle, source: c.source, coverSeed: c.bookTitle, lastAt: Date.now(), bookTitle: c.bookTitle,
    chapterLabel: c.chapterLabel, bookId: c.bookId, coverUrl: c.coverUrl, mode: "reader", kind: "comic",
    page: pos.page, pageCount: c.pages.length,
  };
}

/**
 * Full-screen vertical comic reader. Keeps its place per chapter (page and
 * how far down it) in the library, and the library's latest chapter per
 * series is where "Read" picks up.
 */
export function ComicReaderScreen(props: {
  url: string;
  onUrl: (url: string) => void;
  restore: (url: string) => ChapterProgress | undefined;
  capture: (p: ChapterProgress) => void;
  flush: () => Promise<void> | void;
  onVisit: (item: HistoryItem) => void;
  onClose: () => void;
}) {
  const { chapter, loading, error, retry, prefetch } = useComic(props.url);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const posRef = useRef<ComicPosition>({ page: 0, offset: 0 });
  const savedAt = useRef(0);
  const visited = useRef("");
  const lastY = useRef(0);
  // While true, late-loading images above the saved spot keep us pinned to it.
  const restoring = useRef<ComicPosition | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [pos, setPos] = useState<ComicPosition>({ page: 0, offset: 0 });
  const [listOpen, setListOpen] = useState(false);
  const [failed, setFailed] = useState<Record<number, number>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  const propsRef = useRef(props);
  propsRef.current = props;
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;

  const save = useCallback((force = false) => {
    const c = chapterRef.current;
    if (!c) return;
    const now = Date.now();
    if (!force && now - savedAt.current < SAVE_EVERY_MS) return;
    savedAt.current = now;
    const p = restoring.current ?? posRef.current;
    writeLocalPosition(c.url, p);
    propsRef.current.capture(toProgress(c, p));
    // The on-device library only needs to hear about new pages, not every scroll.
    const visit = `${c.url}#${p.page}`;
    if (visited.current !== visit) {
      visited.current = visit;
      propsRef.current.onVisit(toHistory(c, p));
    }
  }, []);

  const measure = useCallback(() => {
    const tops: number[] = [];
    const heights: number[] = [];
    for (const el of pageRefs.current) {
      if (!el) continue;
      tops.push(el.offsetTop);
      heights.push(el.offsetHeight);
    }
    return { tops, heights };
  }, []);

  const applyRestore = useCallback(() => {
    const el = scrollRef.current;
    const target = restoring.current;
    if (!el || !target) return;
    const { tops, heights } = measure();
    el.scrollTop = scrollFor(tops, heights, target);
  }, [measure]);

  // New chapter: jump to its saved place (or the top), then record the visit.
  useLayoutEffect(() => {
    if (!chapter) return;
    setFailed({});
    pageRefs.current = pageRefs.current.slice(0, chapter.pages.length);
    const saved = propsRef.current.restore(chapter.url) ?? propsRef.current.restore(props.url);
    const start: ComicPosition = saved?.kind === "comic"
      ? { page: saved.readerChunk, offset: saved.readerOffset }
      : readLocalPosition(chapter.url) ?? { page: 0, offset: 0 };
    posRef.current = start;
    setPos(start);
    if (start.page > 0 || start.offset > 0) {
      restoring.current = start;
      applyRestore();
    } else if (scrollRef.current) {
      restoring.current = null;
      scrollRef.current.scrollTop = 0;
    }
    lastY.current = scrollRef.current?.scrollTop ?? 0;
    setChromeHidden(false);
    // Record the visit (and put the chapter in the library) right away.
    save(true);
  }, [chapter, props.url, applyRestore, save]);

  // The user moving the page ends any restore in progress; until then, images
  // loading above the saved spot keep it pinned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stop = () => { restoring.current = null; };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const e of events) el.addEventListener(e, stop, { passive: true });
    return () => { for (const e of events) el.removeEventListener(e, stop); };
  }, [chapter]);

  const frame = useRef<number | null>(null);
  const onScroll = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = scrollRef.current;
      const c = chapterRef.current;
      if (!el || !c) return;
      const y = el.scrollTop;
      const dy = y - lastY.current;
      if (!restoring.current && Math.abs(dy) > 6) setChromeHidden(dy > 0 && y > 80);
      lastY.current = y;
      const { tops, heights } = measure();
      const next = restoring.current ?? locate(tops, heights, y);
      posRef.current = next;
      setPos((p) => (p.page === next.page && Math.abs(p.offset - next.offset) < 0.01 ? p : next));
      if (chapterProgress(next, c.pages.length) > 0.6) prefetch(c.nextUrl);
      save();
    });
  };

  // Keep the place when the tab hides or the reader closes.
  useEffect(() => {
    const hide = () => { save(true); void propsRef.current.flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") hide(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", hide);
      hide();
    };
  }, [save]);

  useEffect(() => {
    setCanFullscreen(typeof document !== "undefined" && !!document.documentElement.requestFullscreen);
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const go = useCallback((url: string | null | undefined) => {
    if (!url) return;
    save(true);
    setListOpen(false);
    propsRef.current.onUrl(url);
  }, [save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      if (e.key === "Escape") propsRef.current.onClose();
      else if (e.key === "ArrowRight" || e.key === "]") go(chapterRef.current?.nextUrl);
      else if (e.key === "ArrowLeft" || e.key === "[") go(chapterRef.current?.prevUrl);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Focus the scroller so arrow/space keys scroll the strip right away.
  useEffect(() => { scrollRef.current?.focus({ preventScroll: true }); }, [chapter]);

  const progress = chapter ? chapterProgress(pos, chapter.pages.length) : 0;
  const title = chapter?.bookTitle ?? "Loading…";
  const label = chapter?.chapterLabel ?? "";

  return (
    <section aria-label="Comic reader" data-comic-reader className="fixed inset-0 z-50 bg-[var(--color-bg)] text-[var(--color-text)]">
      <div ref={scrollRef} tabIndex={-1} onScroll={onScroll} onClick={() => setChromeHidden((h) => !h)}
        className="relative h-full overflow-y-auto overscroll-contain outline-none [overflow-anchor:none]">
        {chapter ? (
          <>
            <div className="pt-safe h-14" aria-hidden />
            {chapter.pages.map((p, i) => {
              const ratio = p.width && p.height ? `${p.width} / ${p.height}` : undefined;
              const retries = failed[i] ?? 0;
              return (
                <div key={`${chapter.url}#${i}`} ref={(el) => { pageRefs.current[i] = el; }}
                  className="relative mx-auto w-full max-w-[800px]" style={ratio ? { aspectRatio: ratio } : { minHeight: "60vh" }}>
                  {retries > 0 && retries % 2 === 1 ? (
                    <div className="absolute inset-0 grid place-items-center bg-[var(--color-panel-2)]">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setFailed((f) => ({ ...f, [i]: retries + 1 })); }}
                        className="flex h-11 items-center gap-2 rounded-full bg-[var(--color-panel)] px-4 text-sm font-semibold hover:bg-[var(--color-hover)]">
                        <RetryIcon size={16} />Page {i + 1} didn&apos;t load · Retry
                      </button>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={retries} src={retries ? `${p.url}${p.url.includes("?") ? "&" : "?"}r=${retries}` : p.url}
                      alt={`Page ${i + 1} of ${chapter.pages.length}`} width={p.width} height={p.height}
                      loading={i < 3 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" draggable={false}
                      onLoad={(e) => {
                        if (!ratio) (e.currentTarget.parentElement as HTMLElement).style.minHeight = "0";
                        if (restoring.current) applyRestore();
                      }}
                      onError={() => setFailed((f) => ({ ...f, [i]: (f[i] ?? 0) + 1 }))}
                      className="block h-auto w-full select-none" />
                  )}
                </div>
              );
            })}
            <div className="pb-safe mx-auto flex max-w-[800px] flex-col items-center gap-3 px-6 pb-36 pt-14 text-center">
              <p className="text-[13px] text-[var(--color-dim)]">End of {chapter.chapterLabel}</p>
              {chapter.nextUrl ? (
                <Button className="w-full max-w-xs" onClick={(e) => { e.stopPropagation(); go(chapter.nextUrl); }}>
                  <NextChapterIcon size={17} />Next chapter
                </Button>
              ) : (
                <p className="text-sm font-medium">You&apos;re caught up.</p>
              )}
              <button type="button" onClick={(e) => { e.stopPropagation(); props.onClose(); }}
                className="h-11 rounded-full px-4 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-hover)]">Back to library</button>
            </div>
          </>
        ) : error && !loading ? (
          <div className="pt-safe mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
            <AlertIcon size={28} className="text-[var(--color-failed)]" />
            <p className="text-[15px] font-semibold">Couldn&apos;t open this chapter</p>
            <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">{error}</p>
            <div className="flex gap-2">
              <Button onClick={retry}><RetryIcon size={16} />Retry</Button>
              <a href={props.url} target="_blank" rel="noreferrer noopener"
                className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-[var(--color-accent-text)] hover:bg-[var(--color-hover)]">Open on site</a>
            </div>
          </div>
        ) : (
          <div className="pt-safe mx-auto max-w-3xl px-5 pt-16"><LoadingSkeleton /></div>
        )}
      </div>

      {/* Hairline progress shows while chrome is away. */}
      <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] h-[2px] transition-opacity ${chromeHidden ? "opacity-100" : "opacity-0"}`}>
        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className={`pt-safe absolute inset-x-0 top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-nav)] backdrop-blur-xl transition duration-200 ${
        chromeHidden ? "pointer-events-none -translate-y-full opacity-0" : ""
      }`} aria-hidden={chromeHidden || undefined}>
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2">
          <IconButton label="Back" onClick={props.onClose}><ChevronLeftIcon size={22} /></IconButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13.5px] font-semibold leading-tight">{label || title}</p>
            <p className="truncate text-[11.5px] leading-tight text-[var(--color-dim)]">{label ? title : chapter?.source}</p>
          </div>
          <IconButton label="Chapters" onClick={() => setListOpen(true)} disabled={!chapter?.chapters?.length}><ListIcon size={20} /></IconButton>
        </div>
      </div>

      <div className={`pb-safe absolute inset-x-0 bottom-0 z-10 border-t border-[var(--color-border)] bg-[var(--color-nav)] backdrop-blur-xl transition duration-200 ${
        chromeHidden ? "pointer-events-none translate-y-full opacity-0" : ""
      }`} aria-hidden={chromeHidden || undefined}>
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <div className="tabular flex items-center gap-3 text-[11px] font-medium text-[var(--color-dim)]">
            <span className="w-9">{Math.round(progress * 100)}%</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="w-16 text-right">{chapter ? `Page ${Math.min(pos.page + 1, chapter.pages.length)}/${chapter.pages.length}` : ""}</span>
          </div>
          <div className="flex items-center justify-between gap-2 py-2.5">
            <IconButton label="Previous chapter" onClick={() => go(chapter?.prevUrl)} disabled={!chapter?.prevUrl}><PrevChapterIcon size={20} /></IconButton>
            <button type="button" onClick={() => setListOpen(true)} disabled={!chapter?.chapters?.length}
              className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--color-accent)] px-4 text-[14.5px] font-semibold text-[var(--color-on-accent)] transition hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-panel-2)] disabled:text-[var(--color-dim)]">
              <ListIcon size={18} />
              <span className="truncate">{chapter?.chapterNumber !== undefined ? `Chapter ${chapter.chapterNumber}` : "Chapters"}</span>
            </button>
            {canFullscreen ? (
              <IconButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
                {fullscreen ? <ShrinkIcon size={19} /> : <ExpandIcon size={19} />}
              </IconButton>
            ) : null}
            <IconButton label="Next chapter" onClick={() => go(chapter?.nextUrl)} disabled={!chapter?.nextUrl}><NextChapterIcon size={20} /></IconButton>
          </div>
        </div>
      </div>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} label="Chapters">
        <p className="eyebrow mb-3">{title}</p>
        <ol className="-mx-2 max-h-[60vh] overflow-y-auto overscroll-contain">
          {chapter?.chapters?.map((c) => {
            const active = c.url === chapter.url;
            return (
              <li key={c.url}>
                <button type="button" onClick={() => go(c.url)} aria-current={active || undefined}
                  className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[14px] transition hover:bg-[var(--color-hover)] ${active ? "bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-text)]" : ""}`}>
                  {c.label}
                </button>
              </li>
            );
          })}
        </ol>
      </Sheet>
    </section>
  );
}
