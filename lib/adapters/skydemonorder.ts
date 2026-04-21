import * as cheerio from "cheerio";
import type { Chapter } from "../types";
import { extractParagraphs, findNavLinks } from "./util";

export function parseSkyDemonOrder(html: string, url: string): Chapter {
  const $ = cheerio.load(html);

  // Title: try h1 first, then <title>
  let title = $("h1").first().text().trim();
  if (!title) {
    const docTitle = $("title").text().trim();
    title = docTitle.split(/\s+[—–-]\s+/)[0].trim();
  }
  if (!title) title = "Untitled chapter";

  // Content: skydemonorder puts the chapter body inside a <main> / <article>
  // with paragraphs as <p> inside a prose-like container. We try the most
  // specific containers first and fall back to the main region.
  const candidates = [
    "article .prose",
    "main .prose",
    "article",
    "main",
  ];

  let paragraphs: string[] = [];
  for (const sel of candidates) {
    const scope = $(sel).first();
    if (!scope.length) continue;
    paragraphs = extractParagraphs($, scope);
    if (paragraphs.length >= 3) break;
  }
  if (paragraphs.length === 0) {
    paragraphs = extractParagraphs($, $("body"));
  }

  // Navigation: skydemonorder typically has "Previous" / "Next" links within
  // the chapter navigation controls. Fall back to scanning all project-scoped
  // links for chapter-number ordering.
  const { nextUrl, prevUrl } = findNavLinks($, url);

  return {
    url,
    title,
    paragraphs,
    nextUrl,
    prevUrl,
    source: "skydemonorder.com",
  };
}
