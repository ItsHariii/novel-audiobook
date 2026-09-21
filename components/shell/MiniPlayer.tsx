"use client";

import { Cover } from "@/components/ui/Cover";
import { EqBars, PauseIcon, PlayIcon } from "@/components/ui/icons";
import { formatClock } from "@/lib/library/group";
import type { AudioState, NowPlaying } from "@/components/screens/shared";

/**
 * Rides above the tab bar on every screen and only answers "what's playing".
 * Tapping the body opens the full player.
 */
export function MiniPlayer(props: {
  nowPlaying: NowPlaying;
  audio: AudioState;
  isBuffering: boolean;
  errorText?: string | null;
  onOpen: () => void;
  onTogglePlay: () => void;
  onRead: () => void;
  onRetry: () => void;
}) {
  const np = props.nowPlaying;
  const playing = props.audio === "playing";
  const left = Math.max(0, np.duration - np.elapsed);
  const title = np.chapterLabel ? `${np.chapterLabel}` : np.title;

  let subtitle: string = np.bookTitle;
  if (props.audio === "preparing") subtitle = "Narrating · you can read now";
  else if (props.audio === "failed") subtitle = props.errorText || "Audio stopped";
  else if (np.duration > 0 && np.elapsed > 0) subtitle = `${formatClock(left)} left · ${np.bookTitle}`;

  return (
    <div
      className="relative flex h-[62px] items-center gap-3 overflow-hidden rounded-[18px] border border-[var(--color-border-strong)] bg-[var(--color-glass)] pl-2.5 pr-2 shadow-[0_14px_34px_-12px_var(--color-shadow)] backdrop-blur-xl"
    >
      {props.audio === "preparing" && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
          <span className="animate-tome-sweep absolute inset-y-0 w-1/3 bg-[var(--color-working)]" />
        </span>
      )}
      {np.duration > 0 && props.audio !== "preparing" && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--color-border)]">
          <span className="block h-full bg-[var(--color-accent)]" style={{ width: `${np.percent}%` }} />
        </span>
      )}
      <button type="button" onClick={props.onOpen} aria-label="Open player" className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Cover size="xs" title={np.bookTitle} seed={np.coverSeed} src={np.coverUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">{props.audio === "failed" ? "Audio stopped" : title}</span>
          <span className={`mt-0.5 block truncate text-[11.5px] leading-tight ${
            props.audio === "failed" ? "text-[var(--color-failed)]" : props.audio === "preparing" ? "text-[var(--color-working)]" : "text-[var(--color-muted)]"
          }`}>{subtitle}</span>
        </span>
        {playing && <EqBars />}
      </button>
      {props.audio === "failed" ? (
        <button type="button" onClick={props.onRetry} className="h-11 shrink-0 rounded-xl bg-[var(--color-failed-soft)] px-3.5 text-[13px] font-semibold text-[var(--color-failed)]">
          Retry audio
        </button>
      ) : props.audio === "preparing" || props.audio === "none" ? (
        <button type="button" onClick={props.onRead} className="h-11 shrink-0 rounded-xl bg-[var(--color-accent-soft)] px-3.5 text-[13px] font-semibold text-[var(--color-accent-text)]">
          Read
        </button>
      ) : (
        <button
          type="button"
          onClick={props.onTogglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]"
        >
          {props.isBuffering && playing && (
            <span aria-hidden className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-[var(--color-accent)]" />
          )}
          {playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
        </button>
      )}
    </div>
  );
}
