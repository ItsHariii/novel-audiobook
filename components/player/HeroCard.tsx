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
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-muted)]">
          {source}
        </p>
        <h1 className="mt-1 truncate font-serif text-lg font-medium leading-tight tracking-tight sm:text-xl">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <p className="tabular hidden text-xs text-[var(--color-muted)] sm:block">
          Part {currentPart} / {totalParts}
        </p>
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
    </section>
  );
}
