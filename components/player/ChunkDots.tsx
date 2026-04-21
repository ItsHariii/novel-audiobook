export function ChunkDots(props: {
  total: number;
  currentIndex: number;
  onPick: (i: number) => void;
  statusOf?: (i: number) => "pending" | "loading" | "ready" | "error";
}) {
  const { total, currentIndex, onPick, statusOf } = props;
  if (total <= 0) return null;

  const half = Math.ceil(total / 2);
  const row1 = Array.from({ length: half }, (_, i) => i);
  const row2 = Array.from({ length: total - half }, (_, i) => half + i);

  return (
    <div className="flex flex-col items-center gap-1.5" aria-label={`Part ${currentIndex + 1} of ${total}`}>
      <Row indexes={row1} current={currentIndex} onPick={onPick} statusOf={statusOf} />
      {row2.length > 0 && (
        <Row indexes={row2} current={currentIndex} onPick={onPick} statusOf={statusOf} />
      )}
    </div>
  );
}

function Row(props: {
  indexes: number[];
  current: number;
  onPick: (i: number) => void;
  statusOf?: (i: number) => "pending" | "loading" | "ready" | "error";
}) {
  return (
    <div className="flex items-center gap-1.5">
      {props.indexes.map((i) => {
        const isCurrent = i === props.current;
        const isPlayed = i < props.current;
        const status = props.statusOf?.(i);
        return (
          <button
            key={i}
            onClick={() => props.onPick(i)}
            aria-label={`Go to part ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              isCurrent
                ? "w-4 bg-[var(--color-accent)]"
                : isPlayed
                  ? "w-1.5 bg-[var(--color-text)]/55 hover:bg-[var(--color-text)]/80"
                  : status === "error"
                    ? "w-1.5 bg-red-500/70"
                    : "w-1.5 bg-[var(--color-text)]/15 hover:bg-[var(--color-text)]/35"
            }`}
          />
        );
      })}
    </div>
  );
}
