import { test } from "node:test";
import assert from "node:assert/strict";
import { acknowledge } from "../lib/library/local";
import { groupHistoryByBook } from "../lib/library/group";
import { bookKey, type ChapterProgress, type ProgressRecord } from "../lib/library/types";
import {
  cleanBookTitle,
  isPlaceholderTitle,
  normalizeBookTitle,
  titleFromUrl,
} from "../lib/library/title";

export const progress: ChapterProgress = {
  chapterUrl: "https://example.com/book/chapter-1",
  bookKey: "book",
  title: "Book",
  source: "example.com",
  mode: "audio",
  voice: "Ava",
  audioTime: 12,
  readerChunk: 0,
  readerOffset: 0,
  wordIndex: 0,
};
const record: ProgressRecord = {
  chapter_url: progress.chapterUrl,
  book_key: progress.bookKey,
  payload: progress,
  revision: 2,
  updated_at: new Date().toISOString(),
};

test("generic chapter routes do not merge different novels", () => {
  const a = { url: "https://novtales.com/chapter/a-1", source: "novtales.com", bookTitle: "A" };
  const b = { ...a, url: "https://novtales.com/chapter/b-1", bookTitle: "B" };
  assert.notEqual(bookKey(a), bookKey(b));
  assert.equal(bookKey(a), bookKey({ ...a, url: "https://novtales.com/chapter/a-2" }));
  assert.equal(bookKey({ ...a, bookId: "novel:123" }), "novel:123");
});

test("maehwasup date permalinks do not become per-day book keys", () => {
  const a = {
    url: "https://maehwasup.com/2026/09/09/chapter-1967/",
    source: "maehwasup.com",
    bookTitle: "Return of the Mount Hua",
  };
  const b = {
    url: "https://maehwasup.com/2026/09/10/chapter-1968/",
    source: "maehwasup.com",
    bookTitle: "Return of the Mount Hua",
  };
  assert.equal(bookKey(a), bookKey(b));
  assert.match(bookKey(a), /returnofthemounthua/);
});

test("novelcool chapter paths fall back to book title identity", () => {
  const a = {
    url: "https://www.novelcool.com/novel/The-Beginning-After-The-End-Chapter-200.html",
    source: "www.novelcool.com",
    bookTitle: "The Beginning After The End",
  };
  const b = {
    ...a,
    url: "https://www.novelcool.com/novel/The-Beginning-After-The-End-Chapter-201.html",
  };
  assert.equal(bookKey(a), bookKey(b));
});

test("in-flight saves preserve newer local activity and advance the base revision", () => {
  const newer = { ...progress, audioTime: 25 };
  const result = acknowledge({ pending: newer }, progress, record, true);
  assert.equal(result.pending?.audioTime, 25);
  assert.equal(result.record?.revision, 2);
  assert.equal(acknowledge({ pending: progress }, progress, record, true).pending, undefined);
});

test("stale offline saves require an explicit conflict choice; imports keep cloud data", () => {
  const result = acknowledge({ pending: progress }, progress, record, false);
  assert.equal(result.conflict, record);
  assert.equal(result.pending, progress);
  const imported = acknowledge({ pending: progress, importing: true }, progress, record, false);
  assert.equal(imported.pending, undefined);
  assert.equal(imported.record, record);
});

test("cleanBookTitle strips chapter clauses and qualifiers", () => {
  assert.equal(
    cleanBookTitle("The Beginning After The End (Web Novel) - Chapter 435: Entourage"),
    "The Beginning After The End",
  );
  assert.equal(
    cleanBookTitle("The Beginning After The End Chapter 200"),
    "The Beginning After The End",
  );
  assert.equal(cleanBookTitle("Became The Patron Of Villains Novel Mtl"), "Became The Patron Of Villains");
});

test("normalizeBookTitle merges cross-site variants", () => {
  const a = normalizeBookTitle("The Beginning After The End (Web Novel)");
  const b = normalizeBookTitle("The Beginning After The End Chapter 200");
  const c = normalizeBookTitle("The Beginning After The End Novel");
  assert.equal(a, b);
  assert.equal(b, c);
});

test("isPlaceholderTitle catches legacy and date fragments", () => {
  assert.equal(isPlaceholderTitle("Saved chapter"), true);
  assert.equal(isPlaceholderTitle("Untitled chapter"), true);
  assert.equal(isPlaceholderTitle("Novel"), true);
  assert.equal(isPlaceholderTitle("09"), true);
  assert.equal(isPlaceholderTitle("30"), true);
  assert.equal(isPlaceholderTitle("Return of the Mount Hua"), false);
});

test("titleFromUrl skips date and chapter segments", () => {
  assert.equal(titleFromUrl("https://maehwasup.com/2026/09/09/chapter-1967/"), null);
  assert.equal(
    titleFromUrl("https://example.com/novel/return-of-the-mount-hua/chapter-10"),
    "Return Of The Mount Hua",
  );
});

test("title variants of one book on one site share a library entry and its cover", () => {
  const item = (url: string, bookTitle: string, lastAt: number, coverUrl?: string) =>
    ({ url, title: bookTitle, bookTitle, source: new URL(url).hostname, coverSeed: bookTitle, lastAt, coverUrl });
  const groups = groupHistoryByBook([
    item("https://maehwasup.com/2026/09/20/chapter-1971/", "Return of the Mount Hua", 2),
    item("https://maehwasup.com/2026/09/21/chapter-1972/", "Return of the Mount Hua Sect", 1, "/api/cover-image?src=x"),
    item("https://maehwasup.com/2026/01/01/chapter-1/", "Solo Leveling", 3),
    item("https://maehwasup.com/2026/01/02/chapter-1/", "Solo Leveling 2", 4),
    item("https://other.com/novel/return/chapter-1", "Return of the Mount Hua Sect Extra", 0),
  ]);
  const hua = groups.find((g) => g.title === "Return of the Mount Hua Sect");
  assert.equal(hua?.chapters.length, 2);
  assert.equal(hua?.coverUrl, "/api/cover-image?src=x");
  assert.equal(hua?.latest.url, "https://maehwasup.com/2026/09/20/chapter-1971/");
  assert.equal(groups.length, 4);
});
