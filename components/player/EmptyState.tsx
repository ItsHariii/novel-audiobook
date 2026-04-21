export function EmptyState() {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-6 py-10 sm:px-10 sm:py-14">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-muted)]">
        Welcome
      </p>
      <h2 className="mt-3 text-balance font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
        Paste a chapter URL to start listening.
      </h2>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-[var(--color-muted)]">
        Use the panel on the left to load any supported chapter URL. The player
        will fetch, narrate, and auto-advance through chapters for you.
      </p>
      <div className="mt-6 grid gap-2 text-sm text-[var(--color-text)]/80 sm:grid-cols-3">
        <Feature label="Auto-advance" />
        <Feature label="Voice & speed control" />
        <Feature label="Resume where you left off" />
      </div>
    </section>
  );
}

function Feature({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      <span>{label}</span>
    </div>
  );
}
