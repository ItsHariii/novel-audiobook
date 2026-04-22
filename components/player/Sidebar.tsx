"use client";

import { useEffect, useMemo, useState } from "react";
import type { HistoryItem } from "@/components/player/types";

export function Sidebar(props: {
  inputUrl: string;
  onInputUrl: (v: string) => void;
  onSubmitUrl: (e: React.FormEvent) => void;
  chapterLoading: boolean;
  history: HistoryItem[];
  onPickHistory: (url: string) => void;
}) {
  const {
    inputUrl,
    onInputUrl,
    onSubmitUrl,
    chapterLoading,
    history,
    onPickHistory,
  } = props;

  const groups = useMemo(() => groupHistoryByBook(history), [history]);

  // Auto-expand only the most recently touched book. Store keys in state so
  // subsequent manual toggles stick even if `history` updates.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (groups.length === 0) return;
    setExpanded((prev) =>
      prev[groups[0].key] === undefined ? { ...prev, [groups[0].key]: true } : prev,
    );
  }, [groups]);

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <form onSubmit={onSubmitUrl} className="mb-5 flex flex-col gap-2">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Chapter URL
        </label>
        <input
          type="url"
          required
          placeholder="https://..."
          value={inputUrl}
          onChange={(e) => onInputUrl(e.target.value)}
          className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)] px-3 py-2 text-sm placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-accent)]/50"
        />
        <button
          type="submit"
          disabled={chapterLoading}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {chapterLoading ? "Loading..." : "Load chapter"}
        </button>
      </form>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Library
      </h2>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {groups.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted)]">
            No listening history yet.
          </div>
        )}
        {groups.map((group) => {
          const isOpen = !!expanded[group.key];
          return (
            <div key={group.key} className="rounded-lg">
              <button
                onClick={() => toggle(group.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]"
              >
                <Chevron open={isOpen} />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-medium">
                    {group.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    {group.source} · {group.chapters.length} chapter
                    {group.chapters.length === 1 ? "" : "s"}
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="mb-1 ml-5 border-l border-[var(--color-border)] pl-2">
                  {group.chapters.map((item) => {
                    const { badge, label } = splitChapterTitle(item.title);
                    return (
                      <button
                        key={item.url}
                        onClick={() => onPickHistory(item.url)}
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                      >
                        {badge && (
                          <span className="tabular mt-[2px] shrink-0 text-[10.5px] font-medium text-[var(--color-muted)]">
                            {badge}
                          </span>
                        )}
                        <span className="line-clamp-2 text-[12.5px] text-[var(--color-text)]/90">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// --- Grouping helpers -------------------------------------------------------

interface BookGroup {
  key: string;
  title: string;
  source: string;
  chapters: HistoryItem[];
  lastAt: number;
}

function groupHistoryByBook(history: HistoryItem[]): BookGroup[] {
  const byKey = new Map<string, BookGroup>();
  for (const item of history) {
    const key = deriveBookKey(item);
    const existing = byKey.get(key);
    if (existing) {
      existing.chapters.push(item);
      if (item.lastAt > existing.lastAt) existing.lastAt = item.lastAt;
    } else {
      byKey.set(key, {
        key,
        title: deriveBookTitle(item),
        source: item.source,
        chapters: [item],
        lastAt: item.lastAt,
      });
    }
  }
  const groups = Array.from(byKey.values());
  // Sort chapters within each group by numeric chapter order (fallback: recency).
  for (const g of groups) {
    g.chapters.sort((a, b) => chapterOrder(a) - chapterOrder(b));
  }
  // Most recently touched book bubbles to the top.
  groups.sort((a, b) => b.lastAt - a.lastAt);
  return groups;
}

function deriveBookKey(item: HistoryItem): string {
  try {
    const u = new URL(item.url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length <= 1) return u.origin + u.pathname;
    // Drop the final segment (the chapter id) to get the book's parent path.
    return u.origin + "/" + parts.slice(0, -1).join("/");
  } catch {
    return item.source + "::" + item.title;
  }
}

function deriveBookTitle(item: HistoryItem): string {
  try {
    const u = new URL(item.url);
    const parts = u.pathname.split("/").filter(Boolean);
    // Prefer the slug immediately before the chapter id; skip generic
    // containers like "novel" / "novels" / "book" / "series".
    const generic = new Set([
      "novel",
      "novels",
      "book",
      "books",
      "series",
      "manga",
      "read",
      "chapter",
      "chapters",
    ]);
    const candidates = parts
      .slice(0, -1)
      .filter((p) => !generic.has(p.toLowerCase()));
    const slug = candidates[candidates.length - 1] ?? parts[0] ?? u.hostname;
    return prettifySlug(slug);
  } catch {
    return item.source;
  }
}

function prettifySlug(slug: string): string {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return slug;
  return cleaned
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function chapterNumberFromTitle(title: string): number | null {
  const m = title.match(/^\s*(?:chapter|ch\.?)?\s*(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function chapterNumberFromUrl(url: string): number | null {
  const m =
    url.match(/chapter[-_]?(\d+)/i) ??
    url.match(/\/(\d+)(?:[/#?]|$)/) ??
    null;
  return m ? parseInt(m[1], 10) : null;
}

function chapterOrder(item: HistoryItem): number {
  const fromTitle = chapterNumberFromTitle(item.title);
  if (fromTitle !== null) return fromTitle;
  const fromUrl = chapterNumberFromUrl(item.url);
  if (fromUrl !== null) return fromUrl;
  // Fallback: older entries first so the ordering is still deterministic.
  return item.lastAt / 1000;
}

function splitChapterTitle(title: string): { badge: string | null; label: string } {
  const num = chapterNumberFromTitle(title);
  if (num === null) return { badge: null, label: title };
  const stripped = title
    .replace(/^\s*(?:chapter|ch\.?)?\s*\d+\s*[—–\-:·•]*\s*/i, "")
    .trim();
  return {
    badge: `#${num}`,
    label: stripped.length > 0 ? stripped : title,
  };
}

function Chevron(props: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 text-[var(--color-muted)] transition-transform ${
        props.open ? "rotate-90" : ""
      }`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
