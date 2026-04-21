export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-6 py-8">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="mt-4 h-9 w-3/4 rounded bg-white/10" />
        <div className="mt-3 h-3 w-28 rounded bg-white/10" />
      </div>
      <div className="animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-6 py-6">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-4 rounded bg-white/10"
              style={{ width: `${70 + ((i * 7) % 25)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
