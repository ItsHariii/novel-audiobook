"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { AlertIcon, LinkIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/primitives";

const KNOWN_SOURCES = ["skydemonorder.com", "maehwasup.com", "novtales.com", "amethystwriters.com"];

type Phase = "idle" | "working" | "failed";

function describeLink(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^www\./, ""), path: u.pathname };
  } catch {
    return { host: url, path: "" };
  }
}

/**
 * "Add a novel": paste a link, watch it load, and either land in the reader
 * or get told what to try next. Loading itself is the player's existing
 * chapter load; this sheet only follows its `loading` / `error` state.
 */
export function AddSheet(props: {
  open: boolean;
  onClose: () => void;
  url: string;
  onUrl: (url: string) => void;
  loading: boolean;
  error: string | null;
  loadedUrl?: string;
  onSubmit: (url: string) => void;
  onLoaded: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempt, setAttempt] = useState("");
  const [canPaste, setCanPaste] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && !!navigator.clipboard?.readText);
  }, []);

  useEffect(() => {
    if (!props.open) setPhase("idle");
  }, [props.open]);

  useEffect(() => {
    if (phase !== "working" || props.loading) return;
    if (props.error && props.loadedUrl !== attempt) setPhase("failed");
    else if (props.loadedUrl === attempt) {
      setPhase("idle");
      props.onLoaded();
    }
  }, [phase, props.loading, props.error, props.loadedUrl, attempt, props.onLoaded]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const url = props.url.trim();
    if (!url) return;
    setAttempt(url);
    setPhase("working");
    props.onSubmit(url);
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) props.onUrl(text);
      inputRef.current?.focus();
    } catch {}
  };

  const link = describeLink(attempt || props.url);

  return (
    <Sheet open={props.open} onClose={props.onClose} label="Add a novel">
      {phase === "working" && (
        <div aria-live="polite">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-working-soft)] text-[var(--color-working)]">
              <LinkIcon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">Reading {link.host}</p>
              <p className="truncate text-[12.5px] text-[var(--color-dim)]">{link.path}</p>
            </div>
          </div>
          <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-[var(--color-border)]">
            <span className="animate-tome-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--color-accent)]" />
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            <Step active>Reading the chapter</Step>
            <Step>Adding to your library</Step>
          </ul>
          <p className="mt-5 text-[12.5px] leading-relaxed text-[var(--color-dim)]">This keeps running if you close the sheet.</p>
          <Button variant="secondary" className="mt-4 w-full" onClick={props.onClose}>Keep browsing</Button>
        </div>
      )}

      {phase === "failed" && (
        <div role="alert">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-failed-soft)] text-[var(--color-failed)]">
            <AlertIcon size={22} />
          </div>
          <h2 className="mt-4 font-serif text-[22px] font-medium">That link didn&apos;t work</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{props.error}</p>
          <div className="mt-4 rounded-2xl bg-[var(--color-panel-2)] p-4">
            <p className="eyebrow mb-3">Things that usually fix it</p>
            <ul className="space-y-2 text-[13.5px] leading-snug">
              <li className="flex gap-2"><span aria-hidden className="text-[var(--color-dim)]">·</span>Open an actual chapter page and copy that link</li>
              <li className="flex gap-2"><span aria-hidden className="text-[var(--color-dim)]">·</span>Check the novel is readable without signing in</li>
              <li className="flex gap-2"><span aria-hidden className="text-[var(--color-dim)]">·</span>Try a mirror site if the original is behind Cloudflare</li>
            </ul>
          </div>
          <p className="mt-3 truncate rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-[12.5px] text-[var(--color-dim)]">{attempt}</p>
          <div className="mt-4 flex gap-2.5">
            <Button className="flex-1" onClick={() => submit()}>Try again</Button>
            <Button variant="secondary" className="flex-1" onClick={() => { setPhase("idle"); setTimeout(() => inputRef.current?.select(), 0); }}>Edit link</Button>
          </div>
        </div>
      )}

      {phase === "idle" && (
        <form onSubmit={submit}>
          <h2 className="font-serif text-[24px] font-medium">Add a novel</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">
            Paste a link to a chapter. Tome follows the next and previous links for you.
          </p>
          <label htmlFor="add-url" className="sr-only">Chapter URL</label>
          <div className="mt-5 flex h-[52px] items-center gap-2.5 rounded-[14px] border border-[var(--color-border-strong)] bg-[var(--color-bg)] pl-3.5 pr-1.5 focus-within:border-[var(--color-accent)]">
            <LinkIcon size={18} className="shrink-0 text-[var(--color-dim)]" />
            <input
              ref={inputRef}
              id="add-url"
              type="url"
              required
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a chapter link"
              value={props.url}
              onChange={(e) => props.onUrl(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--color-dim)]"
            />
            {canPaste && (
              <button type="button" onClick={paste} className="h-10 shrink-0 rounded-[10px] bg-[var(--color-panel-2)] px-3 text-[13px] font-semibold text-[var(--color-text)]">
                Paste
              </button>
            )}
          </div>
          <div className="mt-5">
            <p className="eyebrow mb-2.5">Known sources</p>
            <div className="flex flex-wrap gap-2">
              {KNOWN_SOURCES.map((s) => (
                <span key={s} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 text-[12px] font-medium text-[var(--color-muted)]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-ready)]" />{s}
                </span>
              ))}
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-[var(--color-border-strong)] px-3 text-[12px] font-medium text-[var(--color-dim)]">
                Most other sites work too
              </span>
            </div>
          </div>
          <Button type="submit" className="mt-6 w-full" disabled={props.loading}>{props.loading ? "Loading…" : "Open chapter"}</Button>
        </form>
      )}
    </Sheet>
  );
}

function Step({ children, done, active }: { children: string; done?: boolean; active?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
        done ? "bg-[var(--color-ready-soft)] text-[var(--color-ready)]" : active ? "bg-[var(--color-accent-soft)]" : "border border-[var(--color-border-strong)]"
      }`}>
        {done ? "✓" : active ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-tome-pulse" /> : null}
      </span>
      <span className={done ? "text-[var(--color-muted)]" : active ? "font-medium" : "text-[var(--color-dim)]"}>{children}</span>
    </li>
  );
}
