import * as cheerio from "cheerio";
import type { Chapter } from "../types";
import { extractParagraphs, extractTitles, findNavLinks } from "./util";

export function parseAmethystWriters(html: string, url: string): Chapter {
  const $ = cheerio.load(html);

  const { title, bookTitle, chapterLabel } = extractTitles($, url);

  // Chapter text lives in `.reading-content .text-left`. The rating widget,
  // share buttons, footer and login modals sit outside it, but strip them
  // defensively in case the markup shifts.
  let scope = $(".reading-content .text-left").first();
  if (!scope.length) scope = $(".reading-content").first();
  if (!scope.length) scope = $(".entry-content").first();
  if (!scope.length) scope = $("body");
  scope
    .find(".chapterRatingSection, .the_champ_sharing_container, .modal, footer")
    .remove();

  const paragraphs = extractParagraphs($, scope);

  const { nextUrl, prevUrl } = findNavLinks($, url);

  return {
    url,
    title,
    paragraphs,
    nextUrl,
    prevUrl,
    source: "amethystwriters.com",
    bookTitle,
    chapterLabel,
  };
}
