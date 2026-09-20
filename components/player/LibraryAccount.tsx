"use client";

export function LibraryAccount(props: {
  email?: string; ready: boolean; status: string; conflict: string | null;
  onSignOut: () => Promise<void>;
  onResolve: (keepDevice: boolean) => void;
}) {
  if (!props.ready) return <p className="mb-4 text-xs text-[var(--color-muted)]">Opening your library…</p>;
  if (props.email) return (
    <div className="mb-5 border-b border-[var(--color-border)] pb-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[var(--color-muted)]">{props.email}</span>
        <button className="shrink-0 underline underline-offset-4" onClick={() => void props.onSignOut()}>Sign out</button>
      </div>
      <p role="status" className="mt-2 text-[var(--color-muted)]">{props.status}</p>
      {props.conflict && <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3">
        <p>Another device saved a different stopping point.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button className="text-[var(--color-accent)]" onClick={() => props.onResolve(false)}>Use saved position</button>
          <button className="underline" onClick={() => props.onResolve(true)}>Keep this device</button>
        </div>
      </div>}
    </div>
  );
  return null;
}
