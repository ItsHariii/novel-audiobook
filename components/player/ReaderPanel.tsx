import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { Chunk } from "@/components/player/types";

export function ReaderPanel(props: {
  chunks: Chunk[];
  currentChunkIndex: number;
  onPickChunk: (i: number) => void;
  readerFontSize: number;
  header?: ReactNode;
}) {
  const { chunks, currentChunkIndex, onPickChunk, readerFontSize, header } = props;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
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

  return (
    <div
      className="relative h-full overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-6 py-6 sm:px-14 sm:py-10 lg:px-24 xl:px-32"
      style={{ fontSize: `${readerFontSize}px` }}
    >
      <div className="mx-auto max-w-[110ch]">
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
                  isCurrent
                    ? "bg-[var(--color-accent-soft)]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                {isCurrent && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--color-accent)]"
                  />
                )}
                <p
                  className={`whitespace-pre-wrap leading-[1.7] tracking-[-0.003em] ${
                    isCurrent
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
