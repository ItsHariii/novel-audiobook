export function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading chapter" className="mx-auto w-full max-w-[680px] px-5 py-10 sm:px-8">
      <div className="relative h-2.5 w-24 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
        <span className="animate-tome-sweep absolute inset-y-0 left-0 w-1/2 bg-[var(--color-border-strong)]" />
      </div>
      <div className="mt-5 h-8 w-3/4 rounded-lg bg-[var(--color-panel-2)] animate-tome-pulse" />
      <div className="mt-6 h-px bg-[var(--color-border)]" />
      <div className="mt-8 space-y-3.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-3.5 rounded-full bg-[var(--color-panel-2)] animate-tome-pulse"
            style={{ width: `${72 + ((i * 7) % 26)}%`, animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}
