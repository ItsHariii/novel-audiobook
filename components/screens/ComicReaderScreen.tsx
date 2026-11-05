"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { AlertIcon, AutoScrollIcon, ChevronLeftIcon, ExpandIcon, ListIcon, NextChapterIcon, PauseIcon, PlayIcon, PrevChapterIcon, RetryIcon, ShrinkIcon } from "@/components/ui/icons";
import { Button, IconButton } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/player/LoadingSkeleton";
import { useComic } from "@/lib/comics/useComic";
import { AUTO_SCROLL_SPEEDS, DEFAULT_AUTO_SCROLL_SPEED, readAutoScrollSpeed, speedLabel, useAutoScroll, writeAutoScrollSpeed, type AutoScrollSpeed } from "@/lib/comics/autoScroll";
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
 * Full-screen vertical comic reader. Chapters run on into each other: once a
 * chapter is most of the way read, the next one is appended below it, so
 * scrolling never stops at a chapter's end. Keeps its place per chapter (page
 * and how far down it) in the library, and the library's latest chapter per
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
  const { chapter: entry, chapters, loading, error, retry, prefetch, extend, tail } = useComic(props.url);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const pageRefs = useRef(new Map<string, Array<HTMLDivElement | null>>());
  const posRef = useRef<ComicPosition>({ page: 0, offset: 0 });
  const savedAt = useRef(0);
  const visited = useRef("");
  const lastY = useRef(0);
  // While true, late-loading images above the saved spot keep us pinned to it.
  const restoring = useRef<ComicPosition | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [pos, setPos] = useState<ComicPosition>({ page: 0, offset: 0 });
  // Index in the strip of the chapter at the top of the screen.
  const [active, setActive] = useState(0);
  // Chapters well behind the reader collapse to a box of their measured height,
  // so a long session doesn't keep hundreds of pages alive.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [listOpen, setListOpen] = useState(false);
  const [failed, setFailed] = useState<Record<string, number>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  // Auto-scroll: the speed row shows in the bottom bar once opened from its button.
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState<AutoScrollSpeed>(DEFAULT_AUTO_SCROLL_SPEED);

  const strip = chapters ?? [];
  const activeIndex = Math.max(0, Math.min(active, strip.length - 1));
  const chapter: ComicChapter | null = strip[activeIndex] ?? null;
  const last: ComicChapter | undefined = strip[strip.length - 1];

  const propsRef = useRef(props);
  propsRef.current = props;
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;
  const stripRef = useRef(strip);
  stripRef.current = strip;
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
  const tailRef = useRef(tail);
  tailRef.current = tail;
  const listOpenRef = useRef(listOpen);
  listOpenRef.current = listOpen;

  const save = useCallback((force = false, c: ComicChapter | null = chapterRef.current, at?: ComicPosition) => {
    if (!c) return;
    const now = Date.now();
    if (!force && now - savedAt.current < SAVE_EVERY_MS) return;
    savedAt.current = now;
    const p = at ?? restoring.current ?? posRef.current;
    writeLocalPosition(c.url, p);
    propsRef.current.capture(toProgress(c, p));
    // The on-device library only needs to hear about new pages, not every scroll.
    const visit = `${c.url}#${p.page}`;
    if (visited.current !== visit) {
      visited.current = visit;
      propsRef.current.onVisit(toHistory(c, p));
    }
  }, []);

  const measure = useCallback((c: ComicChapter) => {
    const tops: number[] = [];
    const heights: number[] = [];
    for (const el of (pageRefs.current.get(c.url) ?? []).slice(0, c.pages.length)) {
      if (!el) continue;
      tops.push(el.offsetTop);
      heights.push(el.offsetHeight);
    }
    return { tops, heights };
  }, []);

  const applyRestore = useCallback(() => {
    const el = scrollRef.current;
    const target = restoring.current;
    const first = stripRef.current[0];
    if (!el || !target || !first) return;
    const { tops, heights } = measure(first);
    el.scrollTop = scrollFor(tops, heights, target);
  }, [measure]);

  // Opened chapter: jump to its saved place (or the top), then record the visit.
  useLayoutEffect(() => {
    if (!entry) return;
    setFailed({});
    setHeights({});
    setActive(0);
    activeRef.current = 0;
    chapterRef.current = entry;
    const saved = propsRef.current.restore(entry.url) ?? propsRef.current.restore(props.url);
    const start: ComicPosition = saved?.kind === "comic"
      ? { page: saved.readerChunk, offset: saved.readerOffset }
      : readLocalPosition(entry.url) ?? { page: 0, offset: 0 };
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
    setAutoOn(false);
    // Record the visit (and put the chapter in the library) right away.
    save(true, entry);
  }, [entry, props.url, applyRestore, save]);

  // The user moving the page ends any restore in progress; until then, images
  // loading above the saved spot keep it pinned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stop = () => { restoring.current = null; };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const e of events) el.addEventListener(e, stop, { passive: true });
    return () => { for (const e of events) el.removeEventListener(e, stop); };
  }, [entry]);

  const frame = useRef<number | null>(null);
  const onScroll = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = scrollRef.current;
      const list = stripRef.current;
      if (!el || list.length === 0) return;
      const y = el.scrollTop;
      const dy = y - lastY.current;
      if (!restoring.current && Math.abs(dy) > 6) setChromeHidden(dy > 0 && y > 80);
      lastY.current = y;

      // Which chapter is at the top of the screen.
      let idx = 0;
      for (let i = 0; i < list.length; i++) {
        const s = sectionRefs.current.get(list[i].url);
        if (s && s.offsetTop <= y + 1) idx = i;
      }
      const prevIdx = activeRef.current;
      if (idx !== prevIdx) {
        // Leave the old chapter finished (going down) or at its start (going up).
        const old = list[prevIdx];
        if (old) save(true, old, idx > prevIdx ? { page: old.pages.length - 1, offset: 1 } : { page: 0, offset: 0 });
        restoring.current = null;
        const collapse: Record<string, number> = {};
        list.forEach((ch, i) => {
          const wasHidden = i < prevIdx - 1 && heightsRef.current[ch.url] !== undefined;
          const s = sectionRefs.current.get(ch.url);
          if (i < idx - 1 && !wasHidden && s) collapse[ch.url] = s.getBoundingClientRect().height;
        });
        if (Object.keys(collapse).length) setHeights((h) => ({ ...h, ...collapse }));
        activeRef.current = idx;
        chapterRef.current = list[idx];
        setActive(idx);
      }

      const c = list[idx];
      const { tops, heights } = measure(c);
      const next = restoring.current ?? locate(tops, heights, y);
      posRef.current = next;
      setPos((p) => (p.page === next.page && Math.abs(p.offset - next.offset) < 0.01 ? p : next));
      save(idx !== prevIdx, c);

      // Run on into the next chapter: fetch it early, append it at 80%.
      if (idx === list.length - 1 && c.nextUrl) {
        const seen = chapterProgress(locate(tops, heights, y + el.clientHeight), c.pages.length);
        const nearEnd = el.scrollHeight - (y + el.clientHeight) < el.clientHeight * 1.5;
        if (seen > 0.5) prefetch(c.nextUrl);
        // After a failed load, only the Retry button tries again.
        if ((seen >= 0.8 || nearEnd) && tailRef.current !== "error") extend();
      }
    });
  };

  // A chapter too short to scroll would never trigger the append above.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !last?.nextUrl || tailRef.current === "error") return;
    if (el.scrollHeight - (el.scrollTop + el.clientHeight) < el.clientHeight * 1.5) extend();
  }, [last, extend]);

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

  useEffect(() => { setAutoSpeed(readAutoScrollSpeed()); }, []);

  useAutoScroll(scrollRef, {
    running: autoOn,
    speed: autoSpeed,
    held: () => listOpenRef.current,
    // Wait at the bottom while the next chapter loads; stop once there's nothing more.
    onBottom: () => {
      const end = stripRef.current[stripRef.current.length - 1];
      if (!end?.nextUrl || tailRef.current === "error") {
        setAutoOn(false);
        setChromeHidden(false);
      }
    },
  });

  const startAuto = (speed: AutoScrollSpeed = autoSpeed) => {
    if (speed !== autoSpeed) {
      setAutoSpeed(speed);
      writeAutoScrollSpeed(speed);
    }
    restoring.current = null;
    setAutoOn(true);
    setChromeHidden(true);
  };

  // A chapter already in the strip is scrolled to; anything else opens fresh.
  const go = useCallback((url: string | null | undefined) => {
    if (!url) return;
    setListOpen(false);
    const el = scrollRef.current;
    const section = stripRef.current.some((c) => c.url === url) ? sectionRefs.current.get(url) : undefined;
    if (el && section) {
      restoring.current = null;
      el.scrollTop = section.offsetTop;
      return;
    }
    save(true);
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
  useEffect(() => { scrollRef.current?.focus({ preventScroll: true }); }, [entry]);

  const progress = chapter ? chapterProgress(pos, chapter.pages.length) : 0;
  const title = chapter?.bookTitle ?? "Loading…";
  const label = chapter?.chapterLabel ?? "";

  return (
    <section aria-label="Comic reader" data-comic-reader className="fixed inset-0 z-50 bg-[var(--color-bg)] text-[var(--color-text)]">
      <div ref={scrollRef} tabIndex={-1} onScroll={onScroll} onClick={() => {
        // A tap while auto-scrolling stops it and brings the bar back to resume or change speed.
        if (autoOn) { setAutoOn(false); setChromeHidden(false); } else setChromeHidden((h) => !h);
      }}
        className="relative h-full overflow-y-auto overscroll-contain outline-none [overflow-anchor:none]">
        {last ? (
          <>
            {/* Pages start at the very top and scroll under the status bar and Dynamic Island. */}
            {strip.map((ch, ci) => {
              const remembered = heights[ch.url];
              const hidden = ci < activeIndex - 1 && remembered !== undefined;
              return (
                <section key={ch.url} aria-label={ch.chapterLabel}
                  ref={(el) => { if (el) sectionRefs.current.set(ch.url, el); else sectionRefs.current.delete(ch.url); }}
                  style={hidden ? { height: remembered } : remembered !== undefined ? { minHeight: remembered } : undefined}>
                  {hidden ? null : (
                    <>
                      {ci > 0 ? (
                        <div className="mx-auto flex max-w-[800px] items-center gap-3 px-6 py-7 text-[12px] font-medium text-[var(--color-dim)]">
                          <span aria-hidden className="h-px flex-1 bg-[var(--color-border)]" />
                          <span className="truncate">{ch.chapterLabel}</span>
                          <span aria-hidden className="h-px flex-1 bg-[var(--color-border)]" />
                        </div>
                      ) : null}
                      {ch.pages.map((p, i) => {
                        const ratio = p.width && p.height ? `${p.width} / ${p.height}` : undefined;
                        const key = `${ch.url}#${i}`;
                        const retries = failed[key] ?? 0;
                        return (
                          <div key={key} ref={(el) => {
                            let refs = pageRefs.current.get(ch.url);
                            if (!refs) { refs = []; pageRefs.current.set(ch.url, refs); }
                            refs[i] = el;
                          }}
                            className="relative mx-auto w-full max-w-[800px]" style={ratio ? { aspectRatio: ratio } : { minHeight: "60vh" }}>
                            {retries > 0 && retries % 2 === 1 ? (
                              <div className="absolute inset-0 grid place-items-center bg-[var(--color-panel-2)]">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setFailed((f) => ({ ...f, [key]: retries + 1 })); }}
                                  className="flex h-11 items-center gap-2 rounded-full bg-[var(--color-panel)] px-4 text-sm font-semibold hover:bg-[var(--color-hover)]">
                                  <RetryIcon size={16} />Page {i + 1} didn&apos;t load · Retry
                                </button>
                              </div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={retries} src={retries ? `${p.url}${p.url.includes("?") ? "&" : "?"}r=${retries}` : p.url}
                                alt={`${ch.chapterLabel}, page ${i + 1} of ${ch.pages.length}`} width={p.width} height={p.height}
                                loading={i < 3 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" draggable={false}
                                onLoad={(e) => {
                                  if (!ratio) (e.currentTarget.parentElement as HTMLElement).style.minHeight = "0";
                                  if (restoring.current) applyRestore();
                                }}
                                onError={() => setFailed((f) => ({ ...f, [key]: (f[key] ?? 0) + 1 }))}
                                className="block h-auto w-full select-none" />
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </section>
              );
            })}
            <div className="mx-auto flex max-w-[800px] flex-col items-center gap-3 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+9rem)] pt-14 text-center">
              {last.nextUrl ? (
                tail === "error" ? (
                  <>
                    <p className="text-[13px] text-[var(--color-dim)]">Couldn&apos;t load the next chapter</p>
                    <Button className="w-full max-w-xs" onClick={(e) => { e.stopPropagation(); extend(); }}>
                      <RetryIcon size={16} />Retry
                    </Button>
                  </>
                ) : (
                  <div className="flex min-h-[40vh] flex-col items-center gap-3" aria-live="polite">
                    <span aria-hidden className="relative block size-6">
                      <span className="absolute inset-0 animate-spin rounded-full border-2 border-[var(--color-accent-soft)] border-t-[var(--color-accent)]" />
                    </span>
                    <p className="text-[13px] text-[var(--color-dim)]">Loading the next chapter…</p>
                  </div>
                )
              ) : (
                <>
                  <p className="text-[13px] text-[var(--color-dim)]">End of {last.chapterLabel}</p>
                  <p className="text-sm font-medium">You&apos;re caught up.</p>
                  <button type="button" onClick={(e) => { e.stopPropagation(); props.onClose(); }}
                    className="h-11 rounded-full px-4 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-hover)]">Back to library</button>
                </>
              )}
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
          <div className="mx-auto max-w-3xl px-5 pt-[calc(env(safe-area-inset-top,0px)+4rem)]"><LoadingSkeleton /></div>
        )}
      </div>

      {/* No progress line while the chrome is away: it cuts across the art. Progress shows in the bottom bar. */}
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
          {autoOpen ? (
            <div className="mb-3 flex items-center gap-2">
              <button type="button" onClick={() => (autoOn ? setAutoOn(false) : startAuto())}
                aria-label={autoOn ? "Pause auto-scroll" : "Start auto-scroll"} title={autoOn ? "Pause auto-scroll" : "Start auto-scroll"}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] transition hover:bg-[var(--color-accent-hover)]">
                {autoOn ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              </button>
              <div role="radiogroup" aria-label="Auto-scroll speed" className="tabular flex h-10 min-w-0 flex-1 rounded-full bg-[var(--color-panel-2)] p-1">
                {AUTO_SCROLL_SPEEDS.map((s) => {
                  const on = s === autoSpeed;
                  return (
                    <button key={s} type="button" role="radio" aria-checked={on} onClick={() => startAuto(s)}
                      className={`min-w-0 flex-1 rounded-full text-[12.5px] font-semibold transition ${
                        on ? "bg-[var(--color-panel)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-dim)] hover:text-[var(--color-text)]"
                      }`}>
                      {speedLabel(s)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
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
            <IconButton label="Auto-scroll" active={autoOpen || autoOn} aria-pressed={autoOpen}
              onClick={() => { if (autoOpen) { setAutoOpen(false); setAutoOn(false); } else setAutoOpen(true); }}>
              <AutoScrollIcon size={20} />
            </IconButton>
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
