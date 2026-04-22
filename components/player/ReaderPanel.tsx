import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { Chunk } from "@/components/player/types";

export function ReaderPanel(props: {
  chunks: Chunk[];
  currentChunkIndex: number;
  onPickChunk: (i: number) => void;
  readerFontSize: number;
  header?: ReactNode;
  onUserScroll?: () => void;
  readingMode?: boolean;
}) {
  const {
    chunks,
    currentChunkIndex,
    onPickChunk,
    readerFontSize,
    header,
    onUserScroll,
    readingMode = false,
  } = props;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
  // touchmove). This skips the programmatic scrollIntoView above, which would
  // otherwise hide the header every time the chunk auto-advances.
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
      </div>
    </div>
  );
}
