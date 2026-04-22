export function HeroCard(props: {
  title: string;
  source: string;
  currentPart: number;
  totalParts: number;
  canPrevChapter: boolean;
  canNextChapter: boolean;
  onPrevChapter: () => void;
  onNextChapter: () => void;
}) {
  const {
    title,
    source,
    currentPart,
    totalParts,
    canPrevChapter,
    canNextChapter,
    onPrevChapter,
    onNextChapter,
  } = props;

  return (
    <div className="mb-8 border-b border-[var(--color-border)] pb-6 font-sans">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-muted)]">
        {source}
      </p>
      <h1 className="mt-2 text-balance font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
        {title}
      </h1>
      <div className="mt-4 flex items-center gap-3">
        <p className="tabular text-xs text-[var(--color-muted)]">
          Part {currentPart} / {totalParts}
        </p>
        <span aria-hidden className="h-3 w-px bg-[var(--color-border)]" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPrevChapter}
            disabled={!canPrevChapter}
            aria-label="Previous chapter"
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-1 text-[11px] font-medium text-[var(--color-text)]/90 transition hover:border-white/20 hover:text-[var(--color-text)] disabled:opacity-35"
          >
            Prev
          </button>
          <button
            onClick={onNextChapter}
            disabled={!canNextChapter}
            aria-label="Next chapter"
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-1 text-[11px] font-medium text-[var(--color-text)]/90 transition hover:border-white/20 hover:text-[var(--color-text)] disabled:opacity-35"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
