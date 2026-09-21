"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Cover } from "@/components/ui/Cover";
import { BookIcon, ChevronDownIcon, EqBars, PauseIcon, PlayIcon, TrashIcon } from "@/components/ui/icons";
import { Chip, StatusLine, type Status } from "@/components/ui/primitives";
import { EmptyState } from "@/components/player/EmptyState";
import { formatClock, shortChapter, splitChapterTitle, type BookGroup } from "@/lib/library/group";

type Filter = "all" | "listening" | "reading";

export function LibraryScreen(props: {
  books: BookGroup[];
  currentUrl?: string;
  currentStatus?: { status: Status; label: string } | null;
  focusKey?: string | null;
  banner?: ReactNode;
  onPick: (url: string) => void;
  onResume: (url: string) => void;
  onRead: (url: string) => void;
  playing: boolean;
  onPause: () => void;
  onRemove: (book: BookGroup) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (props.focusKey) setExpanded((prev) => ({ ...prev, [props.focusKey!]: true }));
  }, [props.focusKey]);

  const counts = useMemo(() => ({
    all: props.books.length,
    listening: props.books.filter((b) => b.latest.mode === "audio").length,
    reading: props.books.filter((b) => b.latest.mode !== "audio").length,
  }), [props.books]);
  const books = props.books.filter((b) => filter === "all" || (filter === "listening" ? b.latest.mode === "audio" : b.latest.mode !== "audio"));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.01em] lg:text-[32px]">Library</h1>
      {props.banner}
      {props.books.length > 0 && (
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0" role="group" aria-label="Filter books">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All {counts.all}</Chip>
          <Chip active={filter === "listening"} onClick={() => setFilter("listening")}>Listening {counts.listening}</Chip>
          <Chip active={filter === "reading"} onClick={() => setFilter("reading")}>Reading {counts.reading}</Chip>
        </div>
      )}
      {props.books.length === 0 && <EmptyState onAdd={props.onAdd} />}
      {props.books.length > 0 && books.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-5 text-sm text-[var(--color-muted)]">Nothing here yet.</p>
      )}
      <ul className="flex flex-col gap-2">
        {books.map((book, index) => {
          const isCurrent = !!props.currentUrl && book.chapters.some((c) => c.url === props.currentUrl);
          const open = !!expanded[book.key];
          const continueLabel = book.latest.chapterLabel || book.latest.title;
          const sources = book.sources.length === 1 ? book.sources[0] : `${book.sources[0]} +${book.sources.length - 1}`;
          return (
            <li key={book.key} id={`book-${book.key}`} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
              className="animate-tome-fade rounded-[18px] border border-[var(--color-border)] bg-[var(--color-panel)] transition-colors hover:border-[var(--color-border-strong)]">
              <div className="flex gap-3 p-3">
                <button type="button" onClick={() => setExpanded((p) => ({ ...p, [book.key]: !open }))} aria-expanded={open}
                  aria-label={`${book.title}: ${open ? "hide" : "show"} chapters`} className="flex min-w-0 flex-1 gap-3.5 text-left">
                  <Cover size="sm" title={book.title} seed={book.coverSeed} src={book.coverUrl} />
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                    <div>
                      <p className="truncate text-[15px] font-semibold leading-snug">{book.title}</p>
                      <p className="mt-1 truncate text-[12.5px] text-[var(--color-dim)]">
                        {sources} · {book.chapters.length} {book.chapters.length === 1 ? "chapter" : "chapters"}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {isCurrent && props.playing && <span className="mr-0.5"><EqBars /></span>}
                      {isCurrent && props.currentStatus && <StatusLine status={props.currentStatus.status}>{props.playing ? "Now playing" : props.currentStatus.label}</StatusLine>}
                      <span className="text-[11.5px] font-medium text-[var(--color-dim)]">
                        {isCurrent && props.currentStatus ? "· " : ""}{shortChapter(book.latest)}
                        {!!book.latest.audioTime && ` · ${formatClock(book.latest.audioTime)}`}
                      </span>
                      <ChevronDownIcon size={15} className={`ml-auto text-[var(--color-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </button>
                <div className="-mr-1 flex shrink-0 items-center gap-0.5 self-center">
                <button type="button" onClick={() => setConfirming(confirming === book.key ? null : book.key)}
                  aria-label={`Remove ${book.title} from library`} title="Remove from library" aria-expanded={confirming === book.key}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95 ${
                    confirming === book.key ? "bg-[var(--color-failed-soft)] text-[var(--color-failed)]" : "text-[var(--color-dim)] hover:bg-[var(--color-failed-soft)] hover:text-[var(--color-failed)]"
                  }`}>
                  <TrashIcon size={18} />
                </button>
                <button type="button" onClick={() => props.onRead(book.latest.url)} aria-label={`Read · ${continueLabel}`} title="Read"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] active:scale-95">
                  <BookIcon size={17} />
                </button>
                {isCurrent && props.playing ? (
                  <button type="button" onClick={props.onPause} aria-label="Pause" title="Pause"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] transition active:scale-95">
                    <PauseIcon size={16} />
                  </button>
                ) : (
                  <button type="button" onClick={() => props.onResume(book.latest.url)} aria-label={`Continue · ${continueLabel}`} title="Continue"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-text)] transition hover:brightness-110 active:scale-95">
                    <PlayIcon size={16} />
                  </button>
                )}
                </div>
              </div>
              {confirming === book.key && (
                <div role="alertdialog" aria-label={`Remove ${book.title}?`}
                  className="animate-tome-fade mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--color-failed-soft)] py-2 pl-3.5 pr-2">
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    Remove <strong className="font-semibold">{book.title}</strong>
                    {book.chapters.length > 1 ? ` and all ${book.chapters.length} saved chapters` : ""}?
                  </span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setConfirming(null)}
                      className="h-10 rounded-xl px-3 text-[13px] font-semibold text-[var(--color-muted)] hover:bg-[var(--color-hover)]">Cancel</button>
                    <button type="button" onClick={() => { setConfirming(null); props.onRemove(book); }}
                      className="h-10 rounded-xl bg-[var(--color-failed)] px-4 text-[13px] font-semibold text-[var(--color-bg)] active:scale-95">Remove</button>
                  </div>
                </div>
              )}
              {open && (
                <div className="animate-tome-fade border-t border-[var(--color-border)]">
                <ol className="max-h-[360px] overflow-y-auto overscroll-contain px-2 py-2">
                  {book.chapters.map((item) => {
                    const { badge, label } = splitChapterTitle(item.chapterLabel || item.title);
                    const active = item.url === props.currentUrl;
                    return (
                      <li key={item.url}>
                        <button type="button" onClick={() => props.onPick(item.url)} aria-current={active || undefined}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-[var(--color-hover)] ${active ? "bg-[var(--color-accent-soft)]" : ""}`}>
                          <span className={`tabular w-10 shrink-0 text-right text-[12px] font-semibold ${active ? "text-[var(--color-accent-text)]" : "text-[var(--color-dim)]"}`}>{badge ?? "·"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-[13.5px]">{label}</span>
                            {book.sources.length > 1 && <span className="mt-0.5 block text-[11px] text-[var(--color-dim)]">{item.source}</span>}
                          </span>
                          {!!item.audioTime && <span className="tabular shrink-0 text-[11px] text-[var(--color-dim)]">{formatClock(item.audioTime)}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
