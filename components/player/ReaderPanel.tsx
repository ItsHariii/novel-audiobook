import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Chunk } from "@/components/player/types";

const OVERSCROLL_THRESHOLD = 160;

export function ReaderPanel(props: {
  chunks: Chunk[];
  currentChunkIndex: number;
  onPickChunk: (i: number) => void;
  readerFontSize: number;
  header?: ReactNode;
  onUserScroll?: () => void;
  readingMode?: boolean;
  canReachEnd?: boolean;
  onReachedEnd?: () => void;
}) {
  const {
    chunks,
    currentChunkIndex,
    onPickChunk,
    readerFontSize,
    header,
    onUserScroll,
    readingMode = false,
    canReachEnd = false,
    onReachedEnd,
  } = props;

  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
    const node = refs.current[currentChunkIndex];
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
  }, [currentChunkIndex, reducedMotion]);

  // Fire `onUserScroll` only on user-initiated scroll gestures (wheel or
  // touchmove). Skips programmatic scrollIntoView above.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onUserScroll) return;
    const handler = () => onUserScroll();
    el.addEventListener("wheel", handler, { passive: true });
    el.addEventListener("touchmove", handler, { passive: true });
    return () => {
      el.removeEventListener("wheel", handler);
      el.removeEventListener("touchmove", handler);
    };
  }, [onUserScroll]);

  // Reset overscroll state whenever a new chapter's chunks arrive so the arc
  // doesn't start pre-filled on the next page.
  useEffect(() => {
    overscrollRef.current = 0;
    setOverscroll(0);
    committedRef.current = false;
  }, [chunks]);

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
      className={
        readingMode
          ? "relative h-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
          : "relative h-full overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-6 sm:px-10 sm:py-8"
      }
      style={{ fontSize: `${readerFontSize}px` }}
    >
      <div className={`mx-auto ${readingMode ? "max-w-7xl" : "max-w-5xl"}`}>
        {header}
        <div className="font-serif">
          {chunks.map((c) => {
            const isCurrent = c.index === currentChunkIndex;
            const isPast = c.index < currentChunkIndex;
            return (
              <button
                ref={(el) => {
                  refs.current[c.index] = el;
                }}
                key={c.index}
                onClick={() => onPickChunk(c.index)}
                className={`group relative block w-full rounded-lg px-3 py-2 text-left transition ${
                  !readingMode && isCurrent
                    ? "bg-[var(--color-accent-soft)]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                {!readingMode && isCurrent && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--color-accent)]"
                  />
                )}
                <p
                  className={`whitespace-pre-wrap leading-[1.7] tracking-[-0.003em] ${
                    readingMode
                      ? "text-[var(--color-text)]/90"
                      : isCurrent
                        ? "text-[var(--color-text)]"
                        : isPast
                          ? "text-[var(--color-text)]/55"
                          : "text-[var(--color-text)]/80"
                  }`}
                >
                  {c.text}
                </p>
              </button>
            );
          })}
        </div>
        {canReachEnd && <ChapterEndHint progress={progress} />}
      </div>
    </div>
  );
}

function ChapterEndHint(props: { progress: number }) {
  const ready = props.progress >= 1;
  const R = 17;
  const CIRC = 2 * Math.PI * R;
  return (
    <div className="mt-12 mb-6 flex select-none flex-col items-center gap-2 text-center">
      <div className="relative h-10 w-10">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="2"
          />
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - props.progress)}
            transform="rotate(-90 20 20)"
            style={{ transition: "stroke-dashoffset 120ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-[var(--color-text)]/75">
          {ready ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
