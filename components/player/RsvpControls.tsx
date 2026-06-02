"use client";

import { WpmPicker } from "@/components/player/WpmPicker";

export function RsvpControls(props: {
  hasChapter: boolean;
  isPlaying: boolean;
  wordIndex: number;
  totalWords: number;
  wpm: number;
  onTogglePlay: () => void;
  onSkipWords: (delta: number) => void;
  onSeekWord: (index: number) => void;
  onWpm: (wpm: number) => void;
}) {
  const total = props.totalWords;
  const idx = total > 0 ? Math.min(props.wordIndex, total - 1) : 0;
  const percent =
    total > 0 ? Math.min(100, ((idx + 1) / total) * 100) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur-xl">
      <div className="relative h-[2px] w-full overflow-hidden bg-[var(--color-border)]">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--color-accent)]/70 to-[var(--color-accent)] shadow-[0_0_8px_rgba(167,139,250,0.55)] transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mx-auto flex w-full items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
        <div className="flex items-center gap-1">
          <SkipButton
            label="Back 10 words"
            disabled={!props.hasChapter}
            onClick={() => props.onSkipWords(-10)}
          >
            <SkipBackIcon />
          </SkipButton>
          <PlayButton
            isPlaying={props.isPlaying}
            disabled={!props.hasChapter}
            onClick={props.onTogglePlay}
          />
          <SkipButton
            label="Forward 10 words"
            disabled={!props.hasChapter}
            onClick={() => props.onSkipWords(10)}
          >
            <SkipFwdIcon />
          </SkipButton>
        </div>

        <div className="tabular flex min-w-0 flex-1 items-center gap-3 text-[10.5px] text-[var(--color-muted)]">
          <span className="shrink-0 w-14 text-right">
            {total > 0 ? (idx + 1).toLocaleString() : "0"}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            step={1}
            value={idx}
            onChange={(e) => props.onSeekWord(parseInt(e.target.value, 10))}
            disabled={!props.hasChapter || total === 0}
            className="min-w-0 flex-1"
            aria-label="Seek words"
          />
          <span className="shrink-0 w-14">
            {total.toLocaleString()}
          </span>
          <span className="shrink-0 w-10 text-right hidden sm:inline">
            {Math.round(percent)}%
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <WpmPicker
            wpm={props.wpm}
            onChange={props.onWpm}
            disabled={!props.hasChapter}
          />
        </div>
      </div>
    </div>
  );
}

function PlayButton(props: {
  isPlaying: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.isPlaying ? "Pause" : "Play"}
      title={props.isPlaying ? "Pause" : "Play"}
      className="relative mx-1 grid h-12 w-12 place-items-center rounded-full bg-[var(--color-accent)] text-black shadow-[0_4px_14px_rgba(167,139,250,0.35)] transition hover:bg-[var(--color-accent-hover)] active:scale-95 disabled:opacity-40 disabled:shadow-none"
    >
      {props.isPlaying ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

function SkipButton(props: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      className="grid h-10 w-10 place-items-center rounded-full text-[var(--color-text)]/85 transition hover:bg-white/5 hover:text-[var(--color-text)] disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11.2-7.5a1 1 0 0 0 0-1.66L8.55 3.67A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontFamily="inherit"
        fontSize="7"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </svg>
  );
}

function SkipFwdIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v4h-4" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontFamily="inherit"
        fontSize="7"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </svg>
  );
}
