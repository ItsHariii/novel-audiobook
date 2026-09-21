import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { extractTitles } from "../lib/adapters/util";

test("maehwasup title + og:site_name yields book and chapter", () => {
  const html = `
    <html>
      <head>
        <title>Chapter 1967 &#8211; Return of the Mount Hua</title>
        <meta property="og:title" content="Chapter 1967" />
        <meta property="og:site_name" content="Return of the Mount Hua" />
      </head>
      <body><h1>Chapter 1967</h1><article><p>Once upon a mountain.</p></article></body>
    </html>
  `;
  const $ = cheerio.load(html);
  const result = extractTitles($, "https://maehwasup.com/2026/09/09/chapter-1967/");
  assert.equal(result.bookTitle, "Return of the Mount Hua");
  assert.match(result.chapterLabel ?? "", /Chapter 1967/i);
});

test("compound h1 splits book title from chapter label", () => {
  const html = `
    <html>
      <head><title>The Beginning After The End (Web Novel) - Chapter 435: Entourage</title></head>
      <body>
        <h1>The Beginning After The End (Web Novel) - Chapter 435: Entourage</h1>
        <article><p>Arthur walked into the hall.</p></article>
      </body>
    </html>
  `;
  const $ = cheerio.load(html);
  const result = extractTitles($, "https://novelbuddy.me/novel/tbate/chapter-435");
  assert.equal(result.bookTitle, "The Beginning After The End");
  assert.match(result.chapterLabel ?? "", /Chapter 435/i);
  assert.match(result.chapterLabel ?? "", /Entourage/i);
});

test("og:novel:novel_name preferred when headings are chapter-only", () => {
  const html = `
    <html>
      <head>
        <title>Chapter 10</title>
        <meta property="og:novel:novel_name" content="Divine Emperor Of Death" />
      </head>
      <body><h1>Chapter 10</h1></body>
    </html>
  `;
  const $ = cheerio.load(html);
  const result = extractTitles($, "https://example.com/chapter-10");
  assert.equal(result.bookTitle, "Divine Emperor Of Death");
  assert.equal(result.chapterLabel, "Chapter 10");
});
