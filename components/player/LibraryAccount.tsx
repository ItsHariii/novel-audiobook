"use client";
import { useState } from "react";

export function LibraryAccount(props: {
  email?: string; ready: boolean; status: string; conflict: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onResolve: (keepDevice: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  return <form className="mb-5 space-y-3 border-b border-[var(--color-border)] pb-5" onSubmit={async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { await props.onSignIn(String(data.get("email")), String(data.get("password"))); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not sign in"); }
    finally { setBusy(false); }
  }}>
    <div><h2 className="font-serif text-xl">Your place, saved.</h2><p className="mt-1 text-xs text-[var(--color-muted)]">Sign in to bring your library with you.</p></div>
    <label className="block text-xs">Email<input name="email" type="email" autoComplete="username" required className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2" /></label>
    <label className="block text-xs">Password<input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2" /></label>
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    <button disabled={busy} className="w-full rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}
