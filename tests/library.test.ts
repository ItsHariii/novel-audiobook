import { test } from "node:test";
import assert from "node:assert/strict";
import { acknowledge } from "../lib/library/local";
import { bookKey, type ChapterProgress, type ProgressRecord } from "../lib/library/types";

export const progress: ChapterProgress = { chapterUrl: "https://example.com/book/chapter-1", bookKey: "book", title: "Book", source: "example.com", mode: "audio", voice: "Ava", audioTime: 12, readerChunk: 0, readerOffset: 0, wordIndex: 0 };
const record: ProgressRecord = { chapter_url: progress.chapterUrl, book_key: progress.bookKey, payload: progress, revision: 2, updated_at: new Date().toISOString() };

test("generic chapter routes do not merge different novels", () => {
  const a = { url: "https://novtales.com/chapter/a-1", source: "novtales.com", bookTitle: "A" };
  const b = { ...a, url: "https://novtales.com/chapter/b-1", bookTitle: "B" };
  assert.notEqual(bookKey(a), bookKey(b));
  assert.equal(bookKey(a), bookKey({ ...a, url: "https://novtales.com/chapter/a-2" }));
  assert.equal(bookKey({ ...a, bookId: "novel:123" }), "novel:123");
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
