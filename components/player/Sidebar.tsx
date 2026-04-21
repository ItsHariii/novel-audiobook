import type { HistoryItem } from "@/components/player/types";

export function Sidebar(props: {
  inputUrl: string;
  onInputUrl: (v: string) => void;
  onSubmitUrl: (e: React.FormEvent) => void;
  chapterLoading: boolean;
  history: HistoryItem[];
  onPickHistory: (url: string) => void;
}) {
  const {
    inputUrl,
    onInputUrl,
    onSubmitUrl,
    chapterLoading,
    history,
    onPickHistory,
  } = props;

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <form onSubmit={onSubmitUrl} className="mb-5 flex flex-col gap-2">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Chapter URL
        </label>
        <input
          type="url"
          required
          placeholder="https://..."
          value={inputUrl}
          onChange={(e) => onInputUrl(e.target.value)}
          className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-accent)]/50"
        />
        <button
          type="submit"
          disabled={chapterLoading}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {chapterLoading ? "Loading..." : "Load chapter"}
        </button>
      </form>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Recent
      </h2>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {history.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted)]">
            No listening history yet.
          </div>
        )}
        {history.map((item) => (
          <button
            key={item.url}
            onClick={() => onPickHistory(item.url)}
            className="block w-full rounded-lg p-2.5 text-left transition hover:bg-white/[0.04]"
          >
            <div className="line-clamp-2 text-sm font-medium">{item.title}</div>
            <div className="mt-0.5 text-xs text-[var(--color-muted)]">{item.source}</div>
          </button>
        ))}
      </div>
    </aside>
  );
}
