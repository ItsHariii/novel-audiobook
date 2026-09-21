"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Cover } from "@/components/ui/Cover";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { Chip } from "@/components/ui/primitives";
import { shortChapter, splitChapterTitle, type BookGroup } from "@/lib/library/group";
import type { Chunk } from "@/components/player/types";

type Scope = "all" | "books" | "chapters" | "text";

function highlight(text: string, query: string): ReactNode {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0 || !query) return text;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-transparent font-semibold text-[var(--color-accent-text)]">{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

function snippet(text: string, query: string): string {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, i - 60);
  const end = Math.min(text.length, i + query.length + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** Search across the library's books and chapters, and inside the open chapter. */
export function SearchScreen(props: {
  books: BookGroup[];
  openChapter: { title: string; chunks: Chunk[] } | null;
  onPickChapter: (url: string) => void;
  onPickBook: (key: string) => void;
  onPickChunk: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (q.length < 2) return { books: [], chapters: [], text: [] };
    const books = props.books.filter((b) => b.title.toLowerCase().includes(q));
    const chapters = props.books.flatMap((b) => b.chapters
      .filter((c) => (c.chapterLabel || c.title).toLowerCase().includes(q))
      .map((c) => ({ book: b, item: c }))).slice(0, 40);
    const text = (props.openChapter?.chunks ?? [])
      .filter((c) => c.text.toLowerCase().includes(q))
      .slice(0, 30)
      .map((c) => ({ index: c.index, text: snippet(c.text, q) }));
    return { books, chapters, text };
  }, [q, props.books, props.openChapter]);

  const total = results.books.length + results.chapters.length + results.text.length;
  const show = (s: Scope) => scope === "all" || scope === s;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Search</h1>
      <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border border-[var(--color-border-strong)] bg-[var(--color-panel)] px-3.5 focus-within:border-[var(--color-accent)]">
        <SearchIcon size={18} className="shrink-0 text-[var(--color-dim)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Books, chapters, words"
          aria-label="Search your library"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--color-dim)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid h-9 w-9 place-items-center rounded-full text-[var(--color-dim)] hover:bg-[var(--color-hover)]">
            <CloseIcon size={16} />
          </button>
        )}
      </div>

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0" role="group" aria-label="Search scope">
        <Chip active={scope === "all"} onClick={() => setScope("all")}>All{q.length > 1 ? ` ${total}` : ""}</Chip>
        <Chip active={scope === "books"} onClick={() => setScope("books")}>Books{q.length > 1 ? ` ${results.books.length}` : ""}</Chip>
        <Chip active={scope === "chapters"} onClick={() => setScope("chapters")}>Chapters{q.length > 1 ? ` ${results.chapters.length}` : ""}</Chip>
        {props.openChapter && <Chip active={scope === "text"} onClick={() => setScope("text")}>In this chapter{q.length > 1 ? ` ${results.text.length}` : ""}</Chip>}
      </div>

      {q.length < 2 && (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          Search book titles and chapter names in your library{props.openChapter ? ", or words in the chapter you have open" : ""}.
        </p>
      )}
      {q.length >= 2 && total === 0 && <p className="py-10 text-center text-sm text-[var(--color-muted)]">Nothing matches “{query.trim()}”.</p>}

      {show("books") && results.books.length > 0 && (
        <Group title="Books">
          {results.books.map((b) => (
            <Row key={b.key} onClick={() => props.onPickBook(b.key)}
              lead={<Cover size="xs" title={b.title} seed={b.coverSeed} src={b.coverUrl} />}
              title={highlight(b.title, q)} meta={`${b.sources[0]} · ${b.chapters.length} chapters`} />
          ))}
        </Group>
      )}
      {show("chapters") && results.chapters.length > 0 && (
        <Group title="Chapters">
          {results.chapters.map(({ book, item }) => {
            const { badge, label } = splitChapterTitle(item.chapterLabel || item.title);
            return (
              <Row key={item.url} onClick={() => props.onPickChapter(item.url)}
                lead={<Cover size="xs" title={book.title} seed={book.coverSeed} src={book.coverUrl} />}
                title={<>{badge ? `${badge} · ` : ""}{highlight(label, q)}</>} meta={book.title} />
            );
          })}
        </Group>
      )}
      {show("text") && props.openChapter && results.text.length > 0 && (
        <Group title={`Inside ${props.openChapter.title}`}>
          {results.text.map((t) => (
            <Row key={t.index} onClick={() => props.onPickChunk(t.index)}
              title={<span className="font-serif text-[14.5px] font-normal leading-relaxed">“{highlight(t.text, q)}”</span>}
              meta={`Part ${t.index + 1}`} />
          ))}
        </Group>
      )}
      {q.length < 2 && props.books.length > 0 && (
        <Group title="Recent">
          {props.books.slice(0, 5).map((b) => (
            <Row key={b.key} onClick={() => props.onPickChapter(b.latest.url)}
              lead={<Cover size="xs" title={b.title} seed={b.coverSeed} src={b.coverUrl} />}
              title={b.title} meta={shortChapter(b.latest)} />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-2 mt-2 truncate">{title}</h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function Row(props: { lead?: ReactNode; title: ReactNode; meta: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={props.onClick} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-[var(--color-hover)]">
        {props.lead}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 text-[14px] font-medium">{props.title}</span>
          <span className="mt-0.5 block truncate text-[12px] text-[var(--color-dim)]">{props.meta}</span>
        </span>
      </button>
    </li>
  );
}
