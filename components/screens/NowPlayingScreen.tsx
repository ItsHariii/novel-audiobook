"use client";

import { useState, type ReactNode } from "react";
import { ChunkDots } from "@/components/player/ChunkDots";
import { PlaybackSpeedButton, tileClass } from "@/components/player/PlaybackSpeedButton";
import { SleepTimerButton, type SleepMode } from "@/components/player/SleepTimerButton";
import { Cover } from "@/components/ui/Cover";
import {
  Back15Icon, BookIcon, ChevronDownIcon, Fwd15Icon, ListIcon, NextChapterIcon, PauseIcon, PlayIcon, PrevChapterIcon,
} from "@/components/ui/icons";
import { Sheet } from "@/components/ui/Sheet";
import { formatClock } from "@/lib/library/group";
import type { NowPlaying } from "@/components/screens/shared";

export function NowPlayingScreen(props: {
  nowPlaying: NowPlaying;
  voiceName: string;
  canPlay: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  hasError: boolean;
  status?: ReactNode;
  canPrev: boolean;
  canNext: boolean;
  nextReady: boolean;
  parts: { current: number; total: number };
  onClose: () => void;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onSkip: (delta: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onPickPart: (i: number) => void;
  onRead: () => void;
  sleep: SleepMode;
  sleepRemainingMs: number;
  onSleepSet: (mode: Exclude<SleepMode, null>) => void;
  onSleepCancel: () => void;
  playbackRate: number;
  onPlaybackRate: (rate: number) => void;
}) {
  const np = props.nowPlaying;
  const [partsOpen, setPartsOpen] = useState(false);
  const duration = Math.max(np.duration, 0.1);
  const elapsed = Math.min(np.elapsed, duration);
  const fill = `${(elapsed / duration) * 100}%`;

  return (
    <section aria-label="Now playing" className="pt-safe flex h-full flex-col overflow-y-auto bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-5 pb-8 lg:justify-center">
        <div className="flex items-center justify-between py-2">
          <button type="button" onClick={props.onClose} aria-label="Minimise player" className="grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--color-hover)]">
            <ChevronDownIcon size={22} />
          </button>
          <p className="eyebrow">Now playing</p>
          <button type="button" onClick={() => setPartsOpen(true)} aria-label="Chapter parts" className="grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--color-hover)]">
            <ListIcon size={20} />
          </button>
        </div>

        <div className="flex justify-center px-6 pb-7 pt-5 sm:pt-8">
          <Cover size="xl" title={np.bookTitle} seed={np.coverSeed} byline={np.source} src={np.coverUrl}
            className="max-w-[260px] shadow-[0_30px_60px_-24px_var(--color-shadow)]" />
        </div>

        <div className="text-center">
          <h2 className="line-clamp-2 font-serif text-[22px] font-medium leading-tight">{np.chapterLabel || np.title}</h2>
          <p className="mt-1.5 truncate text-[13px] text-[var(--color-muted)]">{np.bookTitle} · {props.voiceName}</p>
        </div>

        {props.status && <div className="mt-4">{props.status}</div>}

        <div className="mt-6">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={elapsed}
            onChange={(e) => props.onSeek(parseFloat(e.target.value))}
            disabled={!props.canPlay}
            aria-label="Seek"
            aria-valuetext={`${formatClock(elapsed)} of ${formatClock(duration)}`}
            className="block h-6 w-full"
            style={{ ["--fill" as string]: fill }}
          />
          <div className="tabular mt-1 flex justify-between text-[11.5px] font-medium text-[var(--color-dim)]">
            <span>{formatClock(elapsed)}</span>
            <span>−{formatClock(duration - elapsed)}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Transport label="Previous chapter" onClick={props.onPrev} disabled={!props.canPrev}><PrevChapterIcon size={22} /></Transport>
          <Transport label="Back 15 seconds" onClick={() => props.onSkip(-15)} disabled={!props.canPlay}><Back15Icon size={28} /></Transport>
          <button
            type="button"
            onClick={props.onTogglePlay}
            disabled={!props.canPlay}
            aria-label={props.isPlaying ? "Pause" : "Play"}
            title={props.hasError ? "Playback error — tap to retry" : undefined}
            className={`relative grid h-[72px] w-[72px] place-items-center rounded-full text-[var(--color-on-accent)] shadow-[0_12px_28px_-10px_color-mix(in_srgb,var(--color-accent)_70%,transparent)] transition active:scale-95 disabled:opacity-40 disabled:shadow-none ${
              props.hasError ? "bg-[var(--color-failed)]" : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
            }`}
          >
            {props.isBuffering && props.isPlaying && (
              <span aria-hidden className="absolute -inset-1 animate-spin rounded-full border-2 border-[var(--color-accent-soft)] border-t-[var(--color-accent)]" />
            )}
            {props.isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </button>
          <Transport label="Forward 15 seconds" onClick={() => props.onSkip(15)} disabled={!props.canPlay}><Fwd15Icon size={28} /></Transport>
          <Transport label="Next chapter" onClick={props.onNext} disabled={!props.canNext}>
            <NextChapterIcon size={22} />
            {props.nextReady && <span aria-label="Next chapter ready" className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--color-ready)]" />}
          </Transport>
        </div>

        <div className="mt-7 grid grid-cols-4 gap-1 rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1">
          <PlaybackSpeedButton rate={props.playbackRate} onChange={props.onPlaybackRate} disabled={!props.canPlay} />
          <SleepTimerButton sleep={props.sleep} remainingMs={props.sleepRemainingMs} disabled={!props.canPlay}
            onSet={props.onSleepSet} onCancel={props.onSleepCancel} />
          <button type="button" onClick={() => setPartsOpen(true)} className={`${tileClass} text-[var(--color-muted)]`}>
            <span className="tabular text-[15px] font-semibold text-[var(--color-text)]">{props.parts.current}/{props.parts.total}</span>
            <span>Parts</span>
          </button>
          <button type="button" onClick={props.onRead} className={`${tileClass} text-[var(--color-muted)]`}>
            <span className="text-[var(--color-text)]"><BookIcon size={19} /></span>
            <span>Read</span>
          </button>
        </div>
      </div>

      <Sheet open={partsOpen} onClose={() => setPartsOpen(false)} label="Chapter parts">
        <h2 className="font-serif text-[22px] font-medium">Parts</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Part {props.parts.current} of {props.parts.total}. Jump to any part of this chapter.</p>
        <div className="mt-6 flex justify-center">
          <ChunkDots total={props.parts.total} currentIndex={props.parts.current - 1}
            onPick={(i) => { props.onPickPart(i); setPartsOpen(false); }} />
        </div>
      </Sheet>
    </section>
  );
}

function Transport(props: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} aria-label={props.label} title={props.label}
      className="relative grid h-14 w-14 place-items-center rounded-full text-[var(--color-text)] transition hover:bg-[var(--color-hover)] disabled:opacity-30">
      {props.children}
    </button>
  );
}
