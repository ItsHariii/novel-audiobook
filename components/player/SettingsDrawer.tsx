"use client";

import { useEffect } from "react";

export function SettingsDrawer(props: {
  open: boolean;
  onClose: () => void;
  voice: string;
  onVoice: (v: string) => void;
  voices: Array<{ id: string; label: string }>;
  readerFontSize: number;
  onReaderFontSize: (v: number) => void;
}) {
  const {
    open,
    onClose,
    voice,
    onVoice,
    voices,
    readerFontSize,
    onReaderFontSize,
  } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-30 transition ${open ? "pointer-events-auto bg-black/60" : "pointer-events-none bg-black/0"}`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-sm border-l border-[var(--color-border)] bg-[var(--color-panel)] p-4 transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs">
            Close
          </button>
        </div>

        <label className="mb-1 block text-xs text-[var(--color-muted)]">Voice</label>
        <select
          value={voice}
          onChange={(e) => onVoice(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs text-[var(--color-muted)]">Reader font size</label>
        <input
          type="range"
          min={14}
          max={22}
          step={1}
          value={readerFontSize}
          onChange={(e) => onReaderFontSize(parseInt(e.target.value, 10))}
          className="mb-2 w-full"
        />
        <div className="tabular mb-4 text-sm">{readerFontSize}px</div>

        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Toggle between dark mode and the warm parchment light mode from the icon in the top bar.
        </p>
      </aside>
    </div>
  );
}
