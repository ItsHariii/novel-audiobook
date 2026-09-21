"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/primitives";
import { ChevronDownIcon } from "@/components/ui/icons";
import { ReaderTypeControls, ThemePicker, type ReaderPrefs } from "@/components/screens/ReaderSettings";
import type { ThemePreference } from "@/lib/theme";

type MediaLogEntry = { t: number; e: string; ct: number; rs: number; ns: number; buf: number; err?: string };

const SPEEDS = [0.75, 1, 1.15, 1.25, 1.5, 1.75, 2, 2.25, 2.5];

export function YouScreen(props: {
  account: {
    enabled: boolean;
    ready: boolean;
    email?: string;
    status: string;
    conflict: string | null;
    bookCount: number;
    onSignOut: () => Promise<void>;
    onResolve: (keepDevice: boolean) => void;
  };
  voice: string;
  voices: Array<{ id: string; label: string }>;
  onVoice: (v: string) => void;
  playbackRate: number;
  onPlaybackRate: (v: number) => void;
  prefs: ReaderPrefs;
  onPrefs: (next: ReaderPrefs) => void;
  theme: ThemePreference;
  onTheme: (v: ThemePreference) => void;
  mediaLog: MediaLogEntry[];
  onClearMediaLog: () => void;
}) {
  const { account } = props;
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.01em] lg:text-[32px]">You</h1>

      <section className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        {!account.ready ? (
          <p role="status" className="text-sm text-[var(--color-muted)]">Opening your library…</p>
        ) : (
          <>
            <div className="flex items-center gap-3.5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] font-serif text-lg font-medium text-[var(--color-accent-text)]">
                {(account.email?.[0] ?? "T").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{account.email ?? "Reading on this device"}</p>
                <p role="status" className="mt-0.5 truncate text-[12.5px] text-[var(--color-muted)]">
                  {account.status} · {account.bookCount} {account.bookCount === 1 ? "book" : "books"}
                </p>
              </div>
              {account.email && (
                <Button variant="secondary" className="h-11 shrink-0 px-4 text-[13px]" disabled={signingOut}
                  onClick={async () => { setSigningOut(true); try { await account.onSignOut(); } finally { setSigningOut(false); } }}>
                  Sign out
                </Button>
              )}
            </div>
            {account.conflict && (
              <div role="alert" className="mt-4 rounded-2xl bg-[var(--color-working-soft)] p-4 text-sm">
                <p className="font-medium text-[var(--color-text)]">Another device saved a different stopping point.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button className="h-10 text-[13px]" onClick={() => account.onResolve(false)}>Use saved position</Button>
                  <Button variant="secondary" className="h-10 text-[13px]" onClick={() => account.onResolve(true)}>Keep this device</Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <Group title="Listening">
        <Field label="Voice" htmlFor="voice">
          <select id="voice" value={props.voice} onChange={(e) => props.onVoice(e.target.value)}
            className="h-11 max-w-[60%] rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-text)]">
            {props.voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Speed" htmlFor="speed">
          <select id="speed" value={String(props.playbackRate)} onChange={(e) => props.onPlaybackRate(parseFloat(e.target.value))}
            className="tabular h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-text)]">
            {(SPEEDS.includes(props.playbackRate) ? SPEEDS : [...SPEEDS, props.playbackRate].sort((a, b) => a - b))
              .map((r) => <option key={r} value={String(r)}>{r}×</option>)}
          </select>
        </Field>
      </Group>

      <Group title="Appearance">
        <div className="p-4"><ThemePicker value={props.theme} onChange={props.onTheme} /></div>
      </Group>

      <Group title="Reading">
        <div className="p-4"><ReaderTypeControls prefs={props.prefs} onChange={props.onPrefs} /></div>
      </Group>

      <Group title="Advanced">
        <Disclosure title="Keyboard shortcuts">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            {[["Space", "Play / pause"], ["← →", "Back / forward 15 seconds"], ["[ ]", "Previous / next chapter"], ["?", "Show shortcuts"]].map(([k, v]) => (
              <div key={k} className="contents">
                <dt><kbd className="rounded-md border border-[var(--color-border-strong)] px-1.5 py-0.5 font-sans text-[12px]">{k}</kbd></dt>
                <dd className="text-[var(--color-muted)]">{v}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
        <Disclosure title="Playback diagnostics">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] text-[var(--color-muted)]">Last {props.mediaLog.length} media events</p>
            <div className="flex gap-2">
              <button type="button" className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(props.mediaLog, null, 2));
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium" onClick={props.onClearMediaLog}>Clear</button>
            </div>
          </div>
          <pre className="max-h-56 overflow-auto rounded-xl bg-[var(--color-bg)] p-3 text-[10.5px] leading-relaxed text-[var(--color-muted)]">
            {props.mediaLog.length === 0
              ? "No events yet."
              : props.mediaLog.map((e) => {
                  const time = new Date(e.t).toISOString().slice(11, 23);
                  const err = e.err ? ` err=${e.err}` : "";
                  return `${time} ${e.e} ct=${e.ct.toFixed(2)} rs=${e.rs} ns=${e.ns} buf=${e.buf.toFixed(2)}${err}`;
                }).join("\n")}
          </pre>
        </Disclosure>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-2.5 px-1">{title}</h2>
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-[var(--color-panel)]">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between px-4 text-left text-sm font-medium hover:bg-[var(--color-hover)]">
        {title}
        <ChevronDownIcon size={17} className={`text-[var(--color-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
