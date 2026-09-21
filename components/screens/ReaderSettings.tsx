"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/ui/primitives";
import { SunIcon, MoonIcon, SystemIcon } from "@/components/ui/icons";
import type { ReaderFace, ReaderMargin } from "@/components/player/ReaderPanel";
import type { ThemePreference } from "@/lib/theme";

export interface ReaderPrefs {
  fontSize: number;
  lineHeight: number;
  face: ReaderFace;
  margin: ReaderMargin;
}

export const FONT_MIN = 14;
export const FONT_MAX = 26;
const LINE_HEIGHTS = [1.5, 1.75, 1.95];

export function ThemePicker(props: { value: ThemePreference; onChange: (v: ThemePreference) => void }) {
  return (
    <Segmented
      label="Theme"
      value={props.value}
      onChange={props.onChange}
      options={[
        { value: "system", label: <><SystemIcon size={16} />Auto</> },
        { value: "light", label: <><SunIcon size={16} />Light</> },
        { value: "dark", label: <><MoonIcon size={16} />Dark</> },
      ]}
    />
  );
}

/** Type controls shared by the reader's sheet and the You screen. */
export function ReaderTypeControls(props: { prefs: ReaderPrefs; onChange: (next: ReaderPrefs) => void }) {
  const { prefs } = props;
  const set = (patch: Partial<ReaderPrefs>) => props.onChange({ ...prefs, ...patch });
  const fill = `${((prefs.fontSize - FONT_MIN) / (FONT_MAX - FONT_MIN)) * 100}%`;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="eyebrow mb-2.5">Typeface</p>
        <Segmented
          label="Typeface"
          value={prefs.face}
          onChange={(face) => set({ face })}
          options={[
            { value: "serif", label: <span className="font-serif text-[15px]">Lora</span> },
            { value: "sans", label: <span className="font-sans text-[15px]">Inter</span> },
          ]}
        />
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="reader-size" className="eyebrow">Text size</label>
          <span className="tabular text-[12px] font-medium text-[var(--color-muted)]">{prefs.fontSize}px</span>
        </div>
        <div className="flex items-center gap-3">
          <span aria-hidden className="font-serif text-sm text-[var(--color-muted)]">A</span>
          <input id="reader-size" type="range" min={FONT_MIN} max={FONT_MAX} step={1} value={prefs.fontSize}
            onChange={(e) => set({ fontSize: parseInt(e.target.value, 10) })} className="h-8 min-w-0 flex-1"
            style={{ ["--fill" as string]: fill }} />
          <span aria-hidden className="font-serif text-2xl text-[var(--color-muted)]">A</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="eyebrow mb-2.5">Spacing</p>
          <Segmented
            label="Line spacing"
            value={String(prefs.lineHeight)}
            onChange={(v) => set({ lineHeight: parseFloat(v) })}
            options={LINE_HEIGHTS.map((h, i) => ({ value: String(h), label: <LinesGlyph gap={i} /> }))}
          />
        </div>
        <div>
          <p className="eyebrow mb-2.5">Margins</p>
          <Segmented
            label="Margins"
            value={prefs.margin}
            onChange={(margin) => set({ margin })}
            options={[
              { value: "narrow", label: <MarginGlyph inset={2} /> },
              { value: "medium", label: <MarginGlyph inset={5} /> },
              { value: "wide", label: <MarginGlyph inset={8} /> },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function LinesGlyph({ gap }: { gap: number }) {
  const step = 4 + gap * 1.5;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-label={["Tight", "Normal", "Loose"][gap]} role="img">
      {[0, 1, 2].map((i) => <rect key={i} x="3" y={4 + i * step} width="14" height="1.6" rx=".8" fill="currentColor" />)}
    </svg>
  );
}

function MarginGlyph({ inset }: { inset: number }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-label={inset < 4 ? "Narrow" : inset < 7 ? "Medium" : "Wide"} role="img">
      <rect x="1" y="2" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      {[0, 1, 2].map((i) => <rect key={i} x={1 + inset / 2 + 1} y={6 + i * 3.5} width={16 - inset} height="1.4" rx=".7" fill="currentColor" />)}
    </svg>
  );
}

export function ReaderSettingsSheet(props: {
  open: boolean;
  onClose: () => void;
  prefs: ReaderPrefs;
  onPrefs: (next: ReaderPrefs) => void;
  theme: ThemePreference;
  onTheme: (v: ThemePreference) => void;
}) {
  return (
    <Sheet open={props.open} onClose={props.onClose} label="Reading settings">
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow mb-2.5">Theme</p>
          <ThemePicker value={props.theme} onChange={props.onTheme} />
        </div>
        <ReaderTypeControls prefs={props.prefs} onChange={props.onPrefs} />
      </div>
    </Sheet>
  );
}
