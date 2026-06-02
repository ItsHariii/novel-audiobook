"use client";

import { useEffect, useRef, useState } from "react";

const PRESETS: number[] = [200, 300, 400, 500, 600, 800, 1000];

function fmt(wpm: number): string {
  return `${wpm} wpm`;
}

export function WpmPicker(props: {
  wpm: number;
  onChange: (wpm: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = fmt(props.wpm);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => !props.disabled && setOpen((v) => !v)}
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Words per minute: ${label}`}
        title={`Words per minute: ${label}`}
        className="tabular flex h-10 min-w-[64px] items-center justify-center rounded-full px-2.5 text-[11px] font-semibold text-[var(--color-accent)] transition hover:bg-white/5 disabled:opacity-30"
      >
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-2 w-44 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-xl"
        >
          <div className="px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Words per minute
          </div>
          {PRESETS.map((w) => {
            const active = props.wpm === w;
            return (
              <button
                key={w}
                role="menuitem"
                onClick={() => {
                  props.onChange(w);
                  setOpen(false);
                }}
                className={`tabular flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text)]/90"
                }`}
              >
                <span>{fmt(w)}</span>
                {active && <span aria-hidden>●</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
