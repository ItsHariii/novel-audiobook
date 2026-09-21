"use client";

import { useState, type ReactNode } from "react";
import { ReaderPanel } from "@/components/player/ReaderPanel";
import type { Chunk } from "@/components/player/types";
import { ChevronLeftIcon, EqBars, HeadphonesIcon, ListIcon, NextChapterIcon, PauseIcon, PrevChapterIcon, TypeIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/primitives";
import { splitChapterTitle } from "@/lib/library/group";
import type { ReaderPrefs } from "@/components/screens/ReaderSettings";
import type { AudioState } from "@/components/screens/shared";

function minutes(secs: number): string {
  const m = Math.max(1, Math.round(secs / 60));
  return `${m} min`;
}

/**
 * Text on the page. Chrome slides away while you read on and comes back when
 * you scroll up or tap.
 */
export function ReaderScreen(props: {
  chapterKey: string;
  bookTitle: string;
  chapterLabel?: string;
  chapterTitle: string;
  source: string;
  chunks: Chunk[];
  currentChunkIndex: number;
  prefs: ReaderPrefs;
  audio: AudioState;
  followAudio: boolean;
  restorePosition: { chunk: number; offset: number };
  status?: ReactNode;
  /** Listening length of the whole chapter, in seconds at the current speed. */
  totalSeconds: number;
  canPrev: boolean;
  canNext: boolean;
  nextLabel?: string;
  onPosition: (position: { chunk: number; offset: number }) => void;
  onPickChunk: (i: number) => void;
  onReachedEnd: () => void;
  onBack: () => void;
  onChapters: () => void;
  onPrev: () => void;
  onNext: () => void;
  onListen: () => void;
  onPause: () => void;
  onOpenPlayer: () => void;
  onSettings: () => void;
}) {
  const [chromeHidden, setChromeHidden] = useState(false);
  const [progress, setProgress] = useState(0);
  const { badge, label } = splitChapterTitle(props.chapterLabel || props.chapterTitle);
  const eyebrow = badge ? `Chapter ${badge}` : props.source;
  const heading = badge ? (label !== (props.chapterLabel || props.chapterTitle) ? label : props.bookTitle) : props.chapterLabel || props.chapterTitle;
  const playing = props.audio === "playing";

  return (
    <section aria-label="Reader" className="relative h-full bg-[var(--color-bg)]">
      <ReaderPanel
        chapterKey={props.chapterKey}
        chunks={props.chunks}
        currentChunkIndex={props.currentChunkIndex}
        onPickChunk={props.onPickChunk}
        readerFontSize={props.prefs.fontSize}
        lineHeight={props.prefs.lineHeight}
        face={props.prefs.face}
        margin={props.prefs.margin}
        followAudio={props.followAudio}
        restorePosition={props.restorePosition}
        onPosition={props.onPosition}
        onUserScroll={(dir) => setChromeHidden(dir === "down")}
        onScrollProgress={setProgress}
        chromeHidden={chromeHidden}
        onRevealChrome={() => setChromeHidden(false)}
        canReachEnd={props.canNext}
        nextLabel={props.nextLabel}
        onReachedEnd={props.onReachedEnd}
        header={
          <header className="pb-8 pt-16 font-sans">
            <p className="eyebrow text-[var(--color-accent-text)]">{eyebrow}</p>
            <h1 className="mt-3 text-balance font-serif text-[28px] font-medium leading-[1.15] tracking-[-0.015em] sm:text-[34px]">{heading}</h1>
            <p className="mt-2 text-[13px] text-[var(--color-dim)]">{props.bookTitle}</p>
            <div className="mt-6 h-px w-16 bg-[var(--color-border-strong)]" />
          </header>
        }
      />

      {/* Hairline progress shows while chrome is away. */}
      <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] h-[2px] transition-opacity ${chromeHidden ? "opacity-100" : "opacity-0"}`}>
        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className={`pt-safe absolute inset-x-0 top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-nav)] backdrop-blur-xl transition duration-200 ${
        chromeHidden ? "pointer-events-none -translate-y-full opacity-0" : ""
      }`} aria-hidden={chromeHidden || undefined}>
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2">
          <IconButton label="Back" onClick={props.onBack}><ChevronLeftIcon size={22} /></IconButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13.5px] font-semibold leading-tight">{props.chapterLabel || props.chapterTitle}</p>
            <p className="truncate text-[11.5px] leading-tight text-[var(--color-dim)]">{props.bookTitle}</p>
          </div>
          <IconButton label="Chapters" onClick={props.onChapters}><ListIcon size={20} /></IconButton>
        </div>
        {props.status && <div className="mx-auto max-w-3xl px-4 pb-2.5">{props.status}</div>}
      </div>

      <div className={`pb-safe absolute inset-x-0 bottom-0 z-10 border-t border-[var(--color-border)] bg-[var(--color-nav)] backdrop-blur-xl transition duration-200 ${
        chromeHidden ? "pointer-events-none translate-y-full opacity-0" : ""
      }`} aria-hidden={chromeHidden || undefined}>
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <div className="tabular flex items-center gap-3 text-[11px] font-medium text-[var(--color-dim)]">
            <span className="w-9">{Math.round(progress * 100)}%</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="w-14 text-right">{minutes(props.totalSeconds * (1 - progress))} left</span>
          </div>
          <div className="flex items-center justify-between gap-2 py-2.5">
            <IconButton label="Previous chapter" onClick={props.onPrev} disabled={!props.canPrev}><PrevChapterIcon size={20} /></IconButton>
            {playing ? (
              <div className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-[14px] bg-[var(--color-accent-soft)] pl-1">
                <button type="button" onClick={props.onOpenPlayer} className="flex h-full min-w-0 flex-1 items-center justify-center gap-2.5 text-[14px] font-semibold text-[var(--color-accent-text)]">
                  <EqBars />Now playing
                </button>
                <button type="button" onClick={props.onPause} aria-label="Pause" className="grid h-12 w-12 place-items-center rounded-[14px] text-[var(--color-accent-text)]">
                  <PauseIcon size={18} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={props.onListen} disabled={props.audio === "preparing" || props.audio === "failed"}
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--color-accent)] px-4 text-[14.5px] font-semibold text-[var(--color-on-accent)] transition hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-panel-2)] disabled:text-[var(--color-dim)]">
                <HeadphonesIcon size={18} />
                {props.audio === "preparing" ? "Preparing audio…" : "Listen from here"}
              </button>
            )}
            <IconButton label="Reading settings" onClick={props.onSettings}><TypeIcon size={21} /></IconButton>
            <IconButton label="Next chapter" onClick={props.onNext} disabled={!props.canNext}><NextChapterIcon size={20} /></IconButton>
          </div>
        </div>
      </div>
    </section>
  );
}
