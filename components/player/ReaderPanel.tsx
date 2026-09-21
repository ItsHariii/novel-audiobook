"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Chunk } from "@/components/player/types";

const OVERSCROLL_THRESHOLD = 160;

export type ReaderFace = "serif" | "sans";
export type ReaderMargin = "narrow" | "medium" | "wide";

const MARGINS: Record<ReaderMargin, string> = {
  narrow: "max-w-[760px] px-4 sm:px-6",
  medium: "max-w-[680px] px-6 sm:px-8",
  wide: "max-w-[600px] px-8 sm:px-10",
};

export function ReaderPanel(props: {
  chapterKey: string;
  chunks: Chunk[];
  currentChunkIndex: number;
  onPickChunk: (i: number) => void;
  readerFontSize: number;
  lineHeight?: number;
  face?: ReaderFace;
  margin?: ReaderMargin;
  header?: ReactNode;
  footer?: ReactNode;
  /** User scrolled by hand: "down" reads on, "up" looks back. */
  onUserScroll?: (direction: "up" | "down") => void;
  onScrollProgress?: (fraction: number) => void;
  /** While chrome is hidden the first tap only brings it back. */
  chromeHidden?: boolean;
  onRevealChrome?: () => void;
  nextLabel?: string;
  readingMode?: boolean;
  followAudio?: boolean;
  canReachEnd?: boolean;
  onReachedEnd?: () => void;
  restorePosition?: { chunk: number; offset: number };
  onPosition?: (position: { chunk: number; offset: number }) => void;
}) {
  const {
    chapterKey,
    chunks,
    currentChunkIndex,
    onPickChunk,
    readerFontSize,
    lineHeight = 1.75,
    face = "serif",
    margin = "medium",
    header,
    footer,
    onUserScroll,
    onScrollProgress,
    chromeHidden = false,
    onRevealChrome,
    readingMode = false,
    followAudio = true,
    canReachEnd = false,
    onReachedEnd,
  } = props;

  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const onReachedEndRef = useRef(onReachedEnd);
  useEffect(() => {
    onReachedEndRef.current = onReachedEnd;
  }, [onReachedEnd]);

  const [overscroll, setOverscroll] = useState(0);
  const overscrollRef = useRef(0);
  const committedRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const decayTimerRef = useRef<number | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    [],
  );

  useEffect(() => {
    const container = scrollRef.current;
    const position = props.restorePosition;
    if (!container || !position) return;
    const frame = requestAnimationFrame(() => {
      const node = refs.current[position.chunk];
      if (node) container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top + position.offset * node.offsetHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [props.restorePosition, readingMode]);

  // Audio readiness replaces chunk durations, not the chapter. Only a new URL
  // should reset reading position while someone is waiting for audio.
  // Track whether the chapter changed. When it has, we
  // jump to the very top of the scroller so the reader starts at the chapter
  // header instead of centering on the first paragraph.
  const prevChapterRef = useRef(chapterKey);
  useEffect(() => {
    const chapterChanged = prevChapterRef.current !== chapterKey;
    prevChapterRef.current = chapterKey;
    const container = scrollRef.current;
    if (chapterChanged) {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      container?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    // In reading mode the user owns scroll position; only scroll on explicit click.
    if (readingMode || !followAudio) return;
    // Debounce via rAF so rapid chunk advances (ChunkDots clicking, high speed)
    // don't stack overlapping smooth scrolls.
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const node = refs.current[currentChunkIndex];
      if (!node) return;
      node.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    });
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [currentChunkIndex, chapterKey, reducedMotion, readingMode, followAudio]);

  // Fire `onUserScroll` only on user-initiated scroll gestures (wheel or
  // touchmove). Skips programmatic scrollIntoView above.
  const gestureAtRef = useRef(0);
  const lastTopRef = useRef(0);
  const onUserScrollRef = useRef(onUserScroll);
  useEffect(() => {
    onUserScrollRef.current = onUserScroll;
  }, [onUserScroll]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const mark = () => { gestureAtRef.current = Date.now(); };
    const onScroll = () => {
      const top = el.scrollTop;
      const delta = top - lastTopRef.current;
      if (Math.abs(delta) < 6) return;
      lastTopRef.current = top;
      if (Date.now() - gestureAtRef.current < 400) onUserScrollRef.current?.(delta > 0 ? "down" : "up");
    };
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("touchmove", mark, { passive: true });
    el.addEventListener("keydown", mark);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", mark);
      el.removeEventListener("touchmove", mark);
      el.removeEventListener("keydown", mark);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Reset overscroll state whenever a new chapter's chunks arrive so the arc
  // doesn't start pre-filled on the next page.
  useEffect(() => {
    overscrollRef.current = 0;
    setOverscroll(0);
    committedRef.current = false;
  }, [chapterKey]);

  // Pull-past-the-end gesture: once the reader is scrolled to the bottom,
  // accumulate wheel delta / touch drag and load the next chapter once a
  // threshold is exceeded.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !canReachEnd) return;

    const isAtBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
    const reset = () => {
      overscrollRef.current = 0;
      setOverscroll(0);
    };
    const commit = () => {
      if (committedRef.current) return;
      committedRef.current = true;
      onReachedEndRef.current?.();
    };

    const onWheel = (e: WheelEvent) => {
      if (committedRef.current) return;
      if (!isAtBottom()) {
        if (overscrollRef.current !== 0) reset();
        return;
      }
      if (e.deltaY <= 0) return;
      overscrollRef.current += e.deltaY;
      setOverscroll(overscrollRef.current);
      if (overscrollRef.current >= OVERSCROLL_THRESHOLD) {
        commit();
        return;
      }
      if (decayTimerRef.current) window.clearTimeout(decayTimerRef.current);
      decayTimerRef.current = window.setTimeout(reset, 280);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (committedRef.current) return;
      if (touchStartYRef.current === null) return;
      if (!isAtBottom()) return;
      const delta = touchStartYRef.current - (e.touches[0]?.clientY ?? 0);
      if (delta <= 0) {
        if (overscrollRef.current !== 0) reset();
        return;
      }
      overscrollRef.current = delta;
      setOverscroll(delta);
      if (delta >= OVERSCROLL_THRESHOLD) commit();
    };
    const onTouchEnd = () => {
      if (!committedRef.current) reset();
      touchStartYRef.current = null;
    };
    const onScroll = () => {
      if (!isAtBottom() && overscrollRef.current !== 0) reset();
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (decayTimerRef.current) window.clearTimeout(decayTimerRef.current);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("scroll", onScroll);
    };
  }, [canReachEnd]);

  const progress = Math.min(1, overscroll / OVERSCROLL_THRESHOLD);

  return (
    <div
      ref={scrollRef}
      tabIndex={-1}
      onScroll={() => {
        const container = scrollRef.current;
        if (!container) return;
        const range = container.scrollHeight - container.clientHeight;
        onScrollProgress?.(range > 0 ? Math.min(1, container.scrollTop / range) : 0);
        if ((!readingMode && followAudio) || !props.onPosition) return;
        const top = container.getBoundingClientRect().top;
        const index = refs.current.findIndex((node) => node && node.getBoundingClientRect().bottom > top);
        const node = refs.current[index];
        if (node) props.onPosition({ chunk: index, offset: Math.max(0, Math.min(1, (top - node.getBoundingClientRect().top) / node.offsetHeight)) });
      }}
      onClickCapture={(e) => {
        if (!chromeHidden || !onRevealChrome) return;
        e.stopPropagation();
        e.preventDefault();
        onRevealChrome();
      }}
      className="relative h-full overflow-y-auto overscroll-contain outline-none"
      style={{ fontSize: `${readerFontSize}px` }}
    >
      <div className={`mx-auto pb-40 pt-6 sm:pt-10 ${MARGINS[margin]}`}>
        {header}
        <div className={face === "serif" ? "font-serif" : "font-sans"}>
          {chunks.map((c) => {
            const isCurrent = followAudio && !readingMode && c.index === currentChunkIndex;
            return (
              <button
                ref={(el) => {
                  refs.current[c.index] = el;
                }}
                key={c.index}
                type="button"
                onClick={() => onPickChunk(c.index)}
                aria-current={isCurrent || undefined}
                className="relative -mx-3 block w-[calc(100%+1.5rem)] cursor-text rounded-md px-3 text-left"
              >
                <span
                  aria-hidden
                  className={`absolute -left-1 bottom-[0.6em] top-[0.35em] w-[3px] rounded-full bg-[var(--color-accent)] transition-opacity duration-300 ${isCurrent ? "opacity-100" : "opacity-0"}`}
                />
                <p
                  className="mb-[1.05em] whitespace-pre-wrap tracking-[-0.003em] text-[var(--color-text)]/[0.88]"
                  style={{ lineHeight }}
                >
                  {c.text}
                </p>
              </button>
            );
          })}
        </div>
        {canReachEnd && <ChapterEndHint progress={progress} label={props.nextLabel} />}
        {footer}
      </div>
    </div>
  );
}

function ChapterEndHint(props: { progress: number; label?: string }) {
  const ready = props.progress >= 1;
  return (
    <div className="mt-14 flex select-none flex-col items-center gap-3 font-sans">
      <div className="flex w-full items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-dim)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span>{ready ? "Opening next chapter" : props.label ? `Keep scrolling for ${props.label}` : "Keep scrolling for the next chapter"}</span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--color-border)]">
        <div className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-100" style={{ width: `${props.progress * 100}%` }} />
      </div>
    </div>
  );
}
