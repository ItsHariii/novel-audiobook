import { test } from "node:test";
import assert from "node:assert/strict";
import { anilistCover, coverCandidates, pickCover, seriesPages, signCoverUrl, siteImage, verifyCoverUrl } from "../lib/covers/extract";

const page = (head: string, body = "") => `<html><head>${head}</head><body>${body}</body></html>`;

test("cover candidates prefer cover images, then share metadata, as absolute URLs", () => {
  const html = page(
    `<meta property="og:image" content="/wp-content/uploads/og.jpg">
     <script type="application/ld+json">{"@graph":[{"image":{"url":"https://cdn.example.com/ld.jpg"}}]}</script>`,
    `<div class="summary_image"><img data-src="//cdn.example.com/cover.webp" src="data:image/gif;base64,xx"></div>`,
  );
  assert.deepEqual(coverCandidates(html, "https://example.com/novel/foo/chapter-3"), [
    "https://cdn.example.com/cover.webp",
    "https://cdn.example.com/ld.jpg",
    "https://example.com/wp-content/uploads/og.jpg",
  ]);
});

test("logos, icons and the site-wide share image are never picked", () => {
  const siteWide = siteImage(page(`<meta property="og:image" content="https://i0.wp.com/site.com/uploads/image-1.jpg?fit=960">`), "https://site.com/");
  assert.equal(siteWide, "https://i0.wp.com/site.com/uploads/image-1.jpg?fit=960");
  const candidates = [
    "https://site.com/uploads/site-logo.png",
    "https://site.com/favicon.ico",
    "https://site.com/uploads/mark.svg",
    "https://site.com/uploads/image-1.jpg",
  ];
  assert.equal(pickCover(candidates, siteWide), null);
  assert.equal(pickCover([...candidates, "https://site.com/uploads/shadow-slave.jpg"], siteWide), "https://site.com/uploads/shadow-slave.jpg");
});

test("series pages walk up from the chapter, skipping chapter folders", () => {
  assert.deepEqual(seriesPages("https://skydemonorder.com/projects/shadow-slave/chapter-45"), [
    "https://skydemonorder.com/projects/shadow-slave/",
    "https://skydemonorder.com/projects/",
  ]);
  assert.deepEqual(seriesPages("https://site.com/novel/foo/chapters/12"), ["https://site.com/novel/foo/", "https://site.com/novel/"]);
  assert.deepEqual(seriesPages("https://site.com/chapter-1"), []);
});

test("AniList covers need an exact title match", () => {
  const media = [
    { title: { romaji: "Shadow Slave Side Stories", english: null, native: null }, coverImage: { large: "https://a/side.jpg" } },
    { title: { romaji: "Kage no Dorei", english: "Shadow Slave", native: null }, coverImage: { extraLarge: "https://a/xl.jpg", large: "https://a/l.jpg" } },
  ];
  assert.equal(anilistCover(media, "Shadow Slave"), "https://a/xl.jpg");
  const adapted = [
    { format: "MANGA", title: { romaji: "Hwasangwihwan", english: "Return of the Blossoming Blade" }, synonyms: ["Return of The Mount Hua Sect"], coverImage: { large: "https://a/manhwa.jpg" } },
    { format: "NOVEL", title: { romaji: "Hwasangwihwan", english: null }, synonyms: ["Return of the Mount Hua Sect"], coverImage: { large: "https://a/novel.jpg" } },
  ];
  assert.equal(anilistCover(adapted, "Return of the Mount Hua Sect"), "https://a/novel.jpg");
  assert.equal(anilistCover(media, "Shadow"), null);
  assert.equal(anilistCover(media, ""), null);
});

test("signed cover URLs verify only with the same source and secret", () => {
  const sig = signCoverUrl("https://cdn.example.com/c.jpg", "secret");
  assert.ok(verifyCoverUrl("https://cdn.example.com/c.jpg", sig, "secret"));
  assert.ok(!verifyCoverUrl("https://cdn.example.com/other.jpg", sig, "secret"));
  assert.ok(!verifyCoverUrl("https://cdn.example.com/c.jpg", sig, "other"));
  assert.ok(!verifyCoverUrl("https://cdn.example.com/c.jpg", "short", "secret"));
});
