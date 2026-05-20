import * as cheerio from "cheerio";
import type { Chapter } from "../types";
import { extractParagraphs, extractTitles, findNavLinks } from "./util";

export function parseGeneric(html: string, url: string): Chapter {
  const $ = cheerio.load(html);

  const { title, bookTitle, chapterLabel } = extractTitles($, url);

  // Pick the container with the most <p> text as the likely chapter body.
  const scopes = $("article, main, [role='main'], .prose, #content, .content, .chapter, .chapter-content");
  let bestScope = $("body");
  let bestScore = 0;
  scopes.each((_, el) => {
    const $el = $(el);
    const text = $el.find("p").text();
    const score = text.length;
    if (score > bestScore) {
      bestScore = score;
      bestScope = $el;
    }
  });

  const paragraphs = extractParagraphs($, bestScope);
  const { nextUrl, prevUrl } = findNavLinks($, url);

  return {
    url,
    title,
    paragraphs,
    nextUrl,
    prevUrl,
    source: new URL(url).hostname,
    bookTitle,
    chapterLabel,
  };
}
