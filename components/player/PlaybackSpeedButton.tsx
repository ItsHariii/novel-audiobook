"use client";

import { useEffect, useRef, useState } from "react";

const PRESETS: number[] = [
  0.75, 1.0, 1.15, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5,
];

function fmt(rate: number): string {
  return `${Math.round(rate * 100) / 100}x`;
}

export function PlaybackSpeedButton(props: {
  rate: number;
  onChange: (rate: number) => void;
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

  const isNonDefault = Math.abs(props.rate - 1) > 0.001;
  const label = fmt(props.rate);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => !props.disabled && setOpen((v) => !v)}
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Playback speed: ${label}`}
        title={`Playback speed: ${label}`}
        className={`tabular flex h-10 min-w-[44px] items-center justify-center rounded-full px-2.5 text-[11px] font-semibold transition hover:bg-white/5 disabled:opacity-30 ${
          isNonDefault
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-text)]/85 hover:text-[var(--color-text)]"
        }`}
      >
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-2 w-40 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-xl"
        >
          <div className="px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Playback speed
          </div>
          {PRESETS.map((r) => {
            const active = Math.abs(props.rate - r) < 0.005;
            return (
              <button
                key={r}
                role="menuitem"
                onClick={() => {
                  props.onChange(r);
                  setOpen(false);
                }}
                className={`tabular flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text)]/90"
                }`}
              >
                <span>{fmt(r)}</span>
                {active && <span aria-hidden>●</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
