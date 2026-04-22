import type { ChunkStatus } from "@/components/player/types";
import { ChunkDots } from "@/components/player/ChunkDots";
import { SleepTimerButton, type SleepMode } from "@/components/player/SleepTimerButton";

function fmt(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerBar(props: {
  hasChapter: boolean;
  isPlaying: boolean;
  progressPercent: number;
  currentTime: number;
  duration: number;
  onSeek: (next: number) => void;
  onTogglePlay: () => void;
  onSkipBack: () => void;
  onSkipFwd: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  canPrevChapter: boolean;
  canNextChapter: boolean;
  currentChunkIndex: number;
  totalChunks: number;
  currentChunkStatus: ChunkStatus;
  prefetchReady: boolean;
  onPickChunk: (i: number) => void;
  sleep: SleepMode;
  sleepRemainingMs: number;
  onSleepSet: (mode: Exclude<SleepMode, null>) => void;
  onSleepCancel: () => void;
}) {
  const status =
    props.currentChunkStatus === "ready"
      ? "Ready"
      : props.currentChunkStatus === "loading"
        ? "Loading"
        : props.currentChunkStatus === "error"
          ? "Error"
          : "Queued";

  return (
    <div className="safe-bottom safe-left safe-right fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur-md">
      <div className="h-[2px] w-full bg-[var(--color-border)]">
        <div
          className="h-full bg-[var(--color-accent)] transition-[width] duration-200"
          style={{ width: `${props.progressPercent}%` }}
        />
      </div>

      <div className="mx-auto flex w-full items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
        <div className="flex items-center gap-1">
          <IconButton
            onClick={props.onPrevChapter}
            disabled={!props.canPrevChapter}
            label="Previous chapter"
          >
            <PrevIcon />
          </IconButton>
          <IconButton
            onClick={props.onSkipBack}
            disabled={!props.hasChapter}
            label="Back 15 seconds"
          >
            <Back15Icon />
          </IconButton>
          <button
            onClick={props.onTogglePlay}
            disabled={!props.hasChapter}
            aria-label={props.isPlaying ? "Pause" : "Play"}
            className="mx-1 grid h-11 w-11 place-items-center rounded-full bg-[var(--color-accent)] text-black transition hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
          >
            {props.isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <IconButton
            onClick={props.onSkipFwd}
            disabled={!props.hasChapter}
            label="Forward 15 seconds"
          >
            <Fwd15Icon />
          </IconButton>
          <IconButton
            onClick={props.onNextChapter}
            disabled={!props.canNextChapter}
            label="Next chapter"
          >
            <NextIcon />
          </IconButton>
        </div>

        <div className="tabular flex min-w-0 flex-1 items-center gap-3 text-[10.5px] text-[var(--color-muted)]">
          <span className="shrink-0">{fmt(props.currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(props.duration, 0.1)}
            step={0.1}
            value={Math.min(props.currentTime, props.duration || 0)}
            onChange={(e) => props.onSeek(parseFloat(e.target.value))}
            disabled={!props.hasChapter}
            className="min-w-0 flex-1"
            aria-label="Seek"
          />
          <span className="shrink-0">{fmt(props.duration)}</span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {props.hasChapter && props.totalChunks > 0 && (
            <div className="hidden sm:block">
              <ChunkDots
                total={props.totalChunks}
                currentIndex={props.currentChunkIndex}
                onPick={props.onPickChunk}
              />
            </div>
          )}
          <div className="hidden flex-col items-end text-[11px] text-[var(--color-muted)] md:flex">
            <span>{status}</span>
            {props.prefetchReady && (
              <span className="text-[var(--color-accent)]/90">Next ready</span>
            )}
          </div>
          <SleepTimerButton
            sleep={props.sleep}
            remainingMs={props.sleepRemainingMs}
            disabled={!props.hasChapter}
            onSet={props.onSleepSet}
            onCancel={props.onSleepCancel}
          />
        </div>
      </div>
    </div>
  );
}

function IconButton(props: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      className="grid h-10 w-10 place-items-center rounded-full text-[var(--color-text)]/85 transition hover:bg-white/5 hover:text-[var(--color-text)] disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11.2-7.5a1 1 0 0 0 0-1.66L8.55 3.67A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 5v14" />
      <path d="M19 5 9 12l10 7z" fill="currentColor" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 5v14" />
      <path d="M5 5l10 7-10 7z" fill="currentColor" />
    </svg>
  );
}
function Back15Icon() {
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
        15
      </text>
    </svg>
  );
}
function Fwd15Icon() {
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
        15
      </text>
    </svg>
  );
}
