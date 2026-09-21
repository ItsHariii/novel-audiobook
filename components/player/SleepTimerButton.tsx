"use client";

import { useEffect, useRef, useState } from "react";
import { menuClass, menuItemClass, tileClass } from "@/components/player/PlaybackSpeedButton";

export type SleepMode =
  | { kind: "time"; endsAt: number }
  | { kind: "chunk" }
  | { kind: "chapter" }
  | null;

const PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "5 minutes", minutes: 5 },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "45 minutes", minutes: 45 },
  { label: "1 hour", minutes: 60 },
];

export function SleepTimerButton(props: {
  sleep: SleepMode;
  remainingMs: number;
  disabled?: boolean;
  onSet: (mode: Exclude<SleepMode, null>) => void;
  onCancel: () => void;
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

  const active = !!props.sleep;
  const label = describe(props.sleep, props.remainingMs);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => !props.disabled && setOpen((v) => !v)}
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={active ? `Sleep timer: ${label}` : "Sleep timer"}
        title={active ? `Sleep timer: ${label}` : "Sleep timer"}
        className={`${tileClass} ${active ? "text-[var(--color-accent-text)]" : "text-[var(--color-muted)]"}`}
      >
        <span className={active ? "" : "text-[var(--color-text)]"}><MoonIcon /></span>
        <span className="tabular">{active ? label : "Sleep"}</span>
      </button>

      {open && (
        <div
          role="menu"
          className={`${menuClass} w-56`}
        >
          <div className="eyebrow px-3 py-2">
            Sleep timer
          </div>
          {PRESETS.map((p) => (
            <MenuItem
              key={p.minutes}
              onClick={() => {
                props.onSet({
                  kind: "time",
                  endsAt: Date.now() + p.minutes * 60_000,
                });
                setOpen(false);
              }}
              active={
                props.sleep?.kind === "time" &&
                Math.abs(
                  props.sleep.endsAt - Date.now() - p.minutes * 60_000,
                ) < 1000
              }
            >
              {p.label}
            </MenuItem>
          ))}
          <div className="my-1 h-px bg-[var(--color-border)]" />
          <MenuItem
            onClick={() => {
              props.onSet({ kind: "chunk" });
              setOpen(false);
            }}
            active={props.sleep?.kind === "chunk"}
          >
            End of current part
          </MenuItem>
          <MenuItem
            onClick={() => {
              props.onSet({ kind: "chapter" });
              setOpen(false);
            }}
            active={props.sleep?.kind === "chapter"}
          >
            End of chapter
          </MenuItem>
          {active && (
            <>
              <div className="my-1 h-px bg-[var(--color-border)]" />
              <button
                role="menuitem"
                onClick={() => {
                  props.onCancel();
                  setOpen(false);
                }}
                className={`${menuItemClass} text-[var(--color-failed)]`}
              >
                Cancel timer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem(props: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={props.onClick}
      className={`${menuItemClass} ${props.active ? "text-[var(--color-accent-text)]" : "text-[var(--color-text)]"}`}
    >
      <span>{props.children}</span>
      {props.active && <span aria-hidden>●</span>}
    </button>
  );
}

function describe(sleep: SleepMode, ms: number): string {
  if (!sleep) return "";
  if (sleep.kind === "chunk") return "Part";
  if (sleep.kind === "chapter") return "Chapter";
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}:${String(rem).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.3A9 9 0 1 1 11.7 3a7 7 0 0 0 9.3 9.3z" />
    </svg>
  );
}
