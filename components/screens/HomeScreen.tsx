"use client";

import { useEffect, useState } from "react";
import { Cover } from "@/components/ui/Cover";
import { BookIcon, PlayIcon } from "@/components/ui/icons";
import { Button, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { EmptyState } from "@/components/player/EmptyState";
import { formatClock, shortChapter, splitChapterTitle, type BookGroup } from "@/lib/library/group";
import type { NarrationSummary, NowPlaying } from "@/components/screens/shared";

function greeting(now: Date): string {
  const day = now.toLocaleDateString(undefined, { weekday: "long" });
  const h = now.getHours();
  const part = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night";
  return `${day} ${part}`;
}

export function HomeScreen(props: {
  books: BookGroup[];
  nowPlaying: NowPlaying | null;
  narration: NarrationSummary | null;
  onResume: (url: string) => void;
  onRead: (url: string) => void;
  onAdd: () => void;
  onOpenLibrary: () => void;
}) {
  const [eyebrow, setEyebrow] = useState("");
  useEffect(() => setEyebrow(greeting(new Date())), []);

  const [hero, ...rest] = props.books;
  const heroIsCurrent = !!hero && !!props.nowPlaying && hero.chapters.some((c) => c.url === props.nowPlaying!.url);
  const heroItem = heroIsCurrent ? { ...hero.latest, url: props.nowPlaying!.url, chapterLabel: props.nowPlaying!.chapterLabel, title: props.nowPlaying!.title } : hero?.latest;

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="mb-1.5 min-h-3 text-xs text-[var(--color-dim)]">{eyebrow}</p>
        <h1 className="font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.01em] lg:text-[32px]">
          {hero ? "Where were we?" : "Welcome to Tome"}
        </h1>
      </header>

      {!hero && <EmptyState onAdd={props.onAdd} />}

      {hero && heroItem && (
        <section
          aria-label="Continue listening"
          className="rounded-3xl border border-[var(--color-border-strong)] p-[18px]"
          style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--color-accent) 16%, var(--color-panel)) 0%, var(--color-panel) 65%)" }}
        >
          <div className="flex gap-4">
            <Cover size="lg" title={hero.title} seed={hero.coverSeed} byline={hero.sources[0]} src={hero.coverUrl} />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div>
                <span className="inline-flex h-6 items-center rounded-full bg-[var(--color-accent-soft)] px-2.5 text-[10.5px] font-semibold tracking-[0.04em] text-[var(--color-accent-text)]">
                  CONTINUE {heroItem.mode === "reader" ? "READING" : "LISTENING"}
                </span>
                <p className="mt-2.5 truncate font-serif text-[17px] font-medium leading-snug">{hero.title}</p>
                <p className="mt-0.5 truncate text-[13px] text-[var(--color-muted)]">{chapterLine(heroItem.chapterLabel || heroItem.title)}</p>
              </div>
              <HeroProgress nowPlaying={heroIsCurrent ? props.nowPlaying : null} audioTime={heroItem.audioTime} />
            </div>
          </div>
          <div className="mt-4 flex gap-2.5">
            <Button className="flex-1" onClick={() => props.onResume(heroItem.url)} aria-label={`Continue · ${heroItem.chapterLabel || heroItem.title}`}>
              <PlayIcon size={17} />Resume
            </Button>
            <Button variant="secondary" className="w-12 px-0" onClick={() => props.onRead(heroItem.url)} aria-label="Read this chapter instead" title="Read this chapter">
              <BookIcon size={19} />
            </Button>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <SectionTitle action={<button type="button" onClick={props.onOpenLibrary} className="min-h-11 px-1 text-[13px] font-medium text-[var(--color-accent-text)]">All</button>}>
            Keep reading
          </SectionTitle>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 lg:mx-0 lg:px-0">
            {rest.slice(0, 12).map((book) => (
              <button key={book.key} type="button" onClick={() => props.onResume(book.latest.url)} className="w-[104px] shrink-0 text-left"
                aria-label={`${book.title}, ${shortChapter(book.latest)}`}>
                <Cover size="md" title={book.title} seed={book.coverSeed} byline={book.sources[0]} src={book.coverUrl} />
                <p className="mt-2 truncate text-[11.5px] font-medium text-[var(--color-muted)]">{shortChapter(book.latest)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {props.narration && (
        <section>
          <SectionTitle>Narrating now</SectionTitle>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{props.narration.title}</p>
                <p className={`mt-1 text-[12.5px] ${props.narration.failed ? "text-[var(--color-failed)]" : props.narration.done ? "text-[var(--color-ready)]" : "text-[var(--color-working)]"}`}>
                  {props.narration.detail}
                </p>
              </div>
            </div>
            {!props.narration.done && !props.narration.failed && (
              <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                <span className="animate-tome-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--color-working)]" />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function chapterLine(label: string): string {
  const { badge, label: rest } = splitChapterTitle(label);
  return badge ? (rest && rest !== label ? `Chapter ${badge} · ${rest}` : `Chapter ${badge}`) : label;
}

function HeroProgress({ nowPlaying, audioTime }: { nowPlaying: NowPlaying | null; audioTime?: number }) {
  if (nowPlaying && nowPlaying.duration > 0) {
    const left = Math.max(0, nowPlaying.duration - nowPlaying.elapsed);
    return (
      <div className="mt-3">
        <div className="tabular mb-[7px] flex justify-between text-[11px] font-medium text-[var(--color-dim)]">
          <span>{formatClock(left)} left</span>
          <span>{Math.round(nowPlaying.percent)}%</span>
        </div>
        <ProgressBar value={nowPlaying.percent} />
      </div>
    );
  }
  if (audioTime && audioTime > 1) {
    return <p className="tabular mt-3 text-[11px] font-medium text-[var(--color-dim)]">Stopped at {formatClock(audioTime)}</p>;
  }
  return null;
}
