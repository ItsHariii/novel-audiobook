import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAsura, decodeAstroProps } from "../lib/comics/adapters/asura";
import { parseGenericComic } from "../lib/comics/adapters/generic";
import { hotlinkAllowed, pickComicAdapter } from "../lib/comics/adapters";
import { looksLikeComic } from "../lib/comics/detect";

const asuraUrl = "https://asurascans.com/comics/dungeon-odyssey-ab39de10/chapter/119";
const asuraHtml = readFileSync(new URL("./fixtures/asura-chapter.html", import.meta.url), "utf8");

test("astro props decode to plain values", () => {
  assert.deepEqual(decodeAstroProps([0, { a: [0, 1], b: [1, [[0, "x"], [0, { c: [0, null] }]]], d: [0] }]), { a: 1, b: ["x", { c: null }], d: undefined });
});

test("asura chapter yields sized pages, series identity and neighbours", () => {
  const ch = parseAsura(asuraHtml, asuraUrl);
  assert.equal(ch.kind, "comic");
  assert.equal(ch.bookTitle, "Dungeon Odyssey");
  assert.equal(ch.chapterLabel, "Chapter 119");
  assert.equal(ch.chapterNumber, 119);
  assert.equal(ch.bookId, "https://asurascans.com/comics/dungeon-odyssey-ab39de10");
  assert.equal(ch.prevUrl, "https://asurascans.com/comics/dungeon-odyssey-ab39de10/chapter/118");
  assert.equal(ch.nextUrl, "https://asurascans.com/comics/dungeon-odyssey-ab39de10/chapter/120");
  assert.equal(ch.pages.length, 11);
  assert.match(ch.pages[1].url, /^https:\/\/cdn\.asurascans\.com\/.+\/119\/002\.webp/);
  assert.deepEqual([ch.pages[1].width, ch.pages[1].height], [800, 13830]);
  assert.equal(ch.coverUrl, "https://cdn.asurascans.com/asura-images/covers/dungeon-odyssey.f39586.webp");
  assert.deepEqual(ch.chapters?.map((c) => c.number), [175, 120, 119, 118]);
  assert.equal(ch.source, "asurascans.com");
});

test("asura chapters of one series share a book id", () => {
  const other = parseAsura(asuraHtml, "https://asurascans.com/comics/dungeon-odyssey-ab39de10/chapter/120");
  assert.equal(other.bookId, parseAsura(asuraHtml, asuraUrl).bookId);
});

test("asura without island data falls back to page images and links", () => {
  const html = `<title>Dungeon Odyssey Chapter 5 - Read Online | Asura Scans</title>
    <a href="/comics/foo-1/chapter/4">Prev</a><a href="/comics/foo-1/chapter/6">Next</a>
    <img src="/images/logo.webp"><img src="https://cdn.asurascans.com/asura-images/chapters/foo/5/001.webp"><img data-src="https://cdn.asurascans.com/asura-images/chapters/foo/5/002.webp">`;
  const ch = parseAsura(html, "https://asurascans.com/comics/foo-1/chapter/5");
  assert.equal(ch.pages.length, 2);
  assert.equal(ch.bookTitle, "Dungeon Odyssey");
  assert.equal(ch.prevUrl, "https://asurascans.com/comics/foo-1/chapter/4");
  assert.equal(ch.nextUrl, "https://asurascans.com/comics/foo-1/chapter/6");
});

test("generic scan reader collects reader images and nav, skipping chrome", () => {
  const html = `<html><head><title>Solo Leveling Chapter 12 - Some Scans</title></head><body>
    <h1>Solo Leveling Chapter 12</h1>
    <img src="/wp-content/logo.png">
    <div class="reading-content">
      <img data-src=" https://img.example.com/sl/12/01.jpg " src="data:image/gif;base64,x" width="720" height="5000">
      <img data-src="https://img.example.com/sl/12/02.jpg"><img src="https://img.example.com/sl/12/02.jpg">
      <img src="https://img.example.com/sl/12/03.jpg"><img src="https://img.example.com/ads/banner.jpg">
    </div>
    <a href="/manga/solo-leveling/chapter-11/">Prev</a><a href="/manga/solo-leveling/chapter-13/">Next</a></body></html>`;
  const ch = parseGenericComic(html, "https://scans.example.com/manga/solo-leveling/chapter-12/");
  assert.deepEqual(ch.pages.map((p) => p.url), [1, 2, 3].map((n) => `https://img.example.com/sl/12/0${n}.jpg`));
  assert.deepEqual([ch.pages[0].width, ch.pages[0].height], [720, 5000]);
  assert.equal(ch.nextUrl, "https://scans.example.com/manga/solo-leveling/chapter-13/");
  assert.equal(ch.prevUrl, "https://scans.example.com/manga/solo-leveling/chapter-11/");
  assert.equal(ch.bookId, "https://scans.example.com/solo-leveling");
  assert.equal(ch.chapterNumber, 12);
});

test("generic reader falls back to the biggest same-folder image run", () => {
  const imgs = [1, 2, 3, 4].map((n) => `<img src="https://cdn.x.com/c/9/${n}.webp">`).join("");
  const ch = parseGenericComic(`<title>X Chapter 9</title><img src="https://cdn.x.com/thumbs/a.jpg">${imgs}`, "https://x.com/series/x/9");
  assert.equal(ch.pages.length, 4);
});

test("comic links are told apart from novel links", () => {
  assert.equal(looksLikeComic(asuraUrl), true);
  assert.equal(looksLikeComic("https://asuracomic.net/series/foo/chapter/3"), true);
  assert.equal(looksLikeComic("https://site.com/manga/foo/chapter-3"), true);
  assert.equal(looksLikeComic("https://mangadex.org/chapter/abc"), true);
  assert.equal(looksLikeComic("https://skydemonorder.com/projects/shadow-slave/chapter-45"), false);
  assert.equal(looksLikeComic("https://novtales.com/novel/foo/chapter-1"), false);
  assert.equal(looksLikeComic("not a url"), false);
  assert.equal(pickComicAdapter(asuraUrl), parseAsura);
  assert.equal(pickComicAdapter("https://other.com/manga/x/1"), parseGenericComic);
  assert.equal(hotlinkAllowed(asuraUrl), true);
  assert.equal(hotlinkAllowed("https://other.com/manga/x/1"), false);
});

test("scroll position maps to a page and back", async () => {
  const { locate, scrollFor, chapterProgress } = await import("../lib/comics/position");
  const tops = [56, 589, 14000, 28000];
  const heights = [533, 13411, 14000, 500];
  assert.deepEqual(locate(tops, heights, 0), { page: 0, offset: 0 });
  const pos = locate(tops, heights, 7294.5);
  assert.equal(pos.page, 1);
  assert.equal(pos.offset, 0.5);
  assert.equal(scrollFor(tops, heights, pos), 7294.5);
  assert.equal(scrollFor(tops, heights, { page: 99, offset: 2 }), 28500);
  assert.equal(chapterProgress({ page: 2, offset: 0 }, 4), 0.5);
});

test("a comic never merges with a novel of the same name; its chapters share one book", async () => {
  const { groupHistoryByBook } = await import("../lib/library/group");
  const base = { source: "x.com", lastAt: 1, coverSeed: "Solo Leveling", title: "Solo Leveling", bookTitle: "Solo Leveling" };
  const groups = groupHistoryByBook([
    { ...base, url: "https://novel.com/solo-leveling/chapter-1", bookId: "https://novel.com/solo-leveling", chapterLabel: "Chapter 1" },
    { ...base, url: "https://asurascans.com/comics/solo-leveling-1/chapter/1", bookId: "https://asurascans.com/comics/solo-leveling-1", chapterLabel: "Chapter 1", kind: "comic", lastAt: 3 },
    { ...base, url: "https://asurascans.com/comics/solo-leveling-1/chapter/2", bookId: "https://asurascans.com/comics/solo-leveling-1", chapterLabel: "Chapter 2", kind: "comic", lastAt: 5 },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, "comic");
  assert.equal(groups[0].chapters.length, 2);
  assert.equal(groups[0].latest.chapterLabel, "Chapter 2");
  assert.equal(groups[1].kind, undefined);
});

test("auto-scroll speeds stay in a readable range and scale with the strip", async () => {
  const { AUTO_SCROLL_SPEEDS, autoScrollRate } = await import("../lib/comics/autoScroll");
  const phone = AUTO_SCROLL_SPEEDS.map((s) => autoScrollRate(s, 390));
  assert.deepEqual(phone, [45, 67.5, 90, 135, 180]);
  // A phone screen of art (~750px) takes between ~4s and ~17s to pass.
  assert.ok(750 / phone[0] < 20 && 750 / phone[phone.length - 1] > 3);
  // Wider strips have bigger pages, so the same pace moves more pixels, up to the 800px cap.
  assert.equal(autoScrollRate(1, 780), 180);
  assert.equal(autoScrollRate(1, 1600), autoScrollRate(1, 800));
  assert.equal(autoScrollRate(1, 100), autoScrollRate(1, 280));
});
