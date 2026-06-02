"use client";

import { useEffect, useRef } from "react";
import { orpIndex, type RsvpWord } from "@/lib/rsvp";

export function RsvpPanel(props: {
  words: RsvpWord[];
  index: number;
  wpm: number;
  isPlaying: boolean;
  onIndexChange: (next: number) => void;
  onComplete: () => void;
  onTogglePlay: () => void;
}) {
  const indexRef = useRef(props.index);
  useEffect(() => {
    indexRef.current = props.index;
  }, [props.index]);

  const onIndexChangeRef = useRef(props.onIndexChange);
  const onCompleteRef = useRef(props.onComplete);
  useEffect(() => {
    onIndexChangeRef.current = props.onIndexChange;
    onCompleteRef.current = props.onComplete;
  }, [props.onIndexChange, props.onComplete]);

  useEffect(() => {
    if (!props.isPlaying || props.words.length === 0) return;
    // 60000 / wpm = ms per word. Floor at 40ms to keep tab responsive at
    // extreme rates.
    const ms = Math.max(40, Math.round(60000 / props.wpm));
    const id = window.setInterval(() => {
      const next = indexRef.current + 1;
      if (next >= props.words.length) {
        window.clearInterval(id);
        onCompleteRef.current();
        return;
      }
      indexRef.current = next;
      onIndexChangeRef.current(next);
    }, ms);
    return () => window.clearInterval(id);
  }, [props.isPlaying, props.wpm, props.words.length]);

  const word = props.words[props.index]?.word ?? "";
  const pivot = orpIndex(word);
  const before = word.slice(0, pivot);
  const focus = word.slice(pivot, pivot + 1);
  const after = word.slice(pivot + 1);

  const total = props.words.length;
  const wordNo = total === 0 ? 0 : props.index + 1;

  return (
    <button
      type="button"
      onClick={props.onTogglePlay}
      aria-label={props.isPlaying ? "Pause" : "Play"}
      className="relative grid h-full w-full cursor-pointer place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-6 text-left focus:outline-none"
    >
      <div className="pointer-events-none absolute left-0 right-0 top-6 mx-auto h-px w-[min(60%,520px)] bg-[var(--color-border)]" />
      <div className="pointer-events-none absolute bottom-6 left-0 right-0 mx-auto h-px w-[min(60%,520px)] bg-[var(--color-border)]" />

      <div className="pointer-events-none flex flex-col items-center gap-6">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-muted)]">
          {total > 0
            ? `Word ${wordNo.toLocaleString()} / ${total.toLocaleString()}`
            : "No text"}
        </div>
        <div
          aria-live="polite"
          aria-atomic="true"
          className="tabular font-mono text-5xl leading-none sm:text-6xl md:text-7xl"
        >
          <span className="text-[var(--color-text)]/70">{before}</span>
          <span className="text-[var(--color-accent)]">{focus}</span>
          <span className="text-[var(--color-text)]/70">{after}</span>
        </div>
        <div className="text-xs text-[var(--color-muted)]">
          {props.isPlaying ? `${props.wpm} wpm` : "Tap to play"}
        </div>
      </div>
    </button>
  );
}
