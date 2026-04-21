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
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-6 sm:px-8 sm:py-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-muted)]">
        {source}
      </p>
      <h1 className="mt-3 text-balance font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="tabular mt-3 text-sm text-[var(--color-muted)]">
        Part {currentPart} of {totalParts}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onPrevChapter}
          disabled={!canPrevChapter}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-text)]/90 transition hover:border-white/20 hover:text-[var(--color-text)] disabled:opacity-35"
        >
          Previous chapter
        </button>
        <button
          onClick={onNextChapter}
          disabled={!canNextChapter}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-text)]/90 transition hover:border-white/20 hover:text-[var(--color-text)] disabled:opacity-35"
        >
          Next chapter
        </button>
      </div>
    </section>
  );
}
