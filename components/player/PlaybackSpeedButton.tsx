"use client";

import { useEffect, useRef, useState } from "react";

const PRESETS: number[] = [
  0.75, 1.0, 1.15, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5,
];

function fmt(rate: number): string {
  return `${Math.round(rate * 100) / 100}x`;
}

const TILE =
  "flex h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition hover:bg-[var(--color-hover)] disabled:opacity-35";
const MENU =
  "absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-[0_20px_40px_-12px_var(--color-shadow)]";
const MENU_ITEM =
  "flex min-h-10 w-full items-center justify-between rounded-[10px] px-3 text-left text-[13px] transition hover:bg-[var(--color-hover)]";

export { TILE as tileClass, MENU as menuClass, MENU_ITEM as menuItemClass };

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
        className={`${TILE} ${isNonDefault ? "text-[var(--color-accent-text)]" : "text-[var(--color-muted)]"}`}
      >
        <span className="tabular text-[15px] font-semibold text-[var(--color-text)]">{label.replace("x", "×")}</span>
        <span>Speed</span>
      </button>

      {open && (
        <div
          role="menu"
          className={`${MENU} w-40`}
        >
          <div className="eyebrow px-3 py-2">
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
                className={`tabular ${MENU_ITEM} ${active ? "text-[var(--color-accent-text)]" : "text-[var(--color-text)]"}`}
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
