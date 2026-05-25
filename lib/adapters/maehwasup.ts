import * as cheerio from "cheerio";
import type { Chapter } from "../types";
import { extractParagraphs, extractTitles, findNavLinks } from "./util";

const SEPARATOR_RE = /^_{3,}$/;
const NEXT_CHAPTER_RE = /^(?:[<>]+\s*)?(?:next|prev(?:ious)?)\s+chapter(?:\s*[<>]+)?$/i;
const GLOSSARY_RE = /glossary\s*\|\|\s*about/i;
const PATREON_RE = /patreon|buymeacoffee/i;

export function parseMaehwasup(html: string, url: string): Chapter {
  const $ = cheerio.load(html);

  const { title, bookTitle, chapterLabel } = extractTitles($, url);

  const scope = $(".entry-content").first();
  const raw = scope.length
    ? extractParagraphs($, scope)
    : extractParagraphs($, $("body"));

  const paragraphs = trimMaehwasupBoilerplate(raw);

  const { nextUrl, prevUrl } = findNavLinks($, url);

  return {
    url,
    title,
    paragraphs,
    nextUrl,
    prevUrl,
    source: "maehwasup.com",
    bookTitle,
    chapterLabel,
  };
}

function trimMaehwasupBoilerplate(paragraphs: string[]): string[] {
  // Drop everything from the first end-of-chapter marker onward:
  // "Next chapter >>>", an underscore separator, or the Patreon/support blurb.
  let end = paragraphs.length;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (SEPARATOR_RE.test(p) || NEXT_CHAPTER_RE.test(p) || PATREON_RE.test(p)) {
      end = i;
      break;
    }
  }

  // Filter standalone nav/glossary lines anywhere in the body.
  return paragraphs.slice(0, end).filter((p) => !GLOSSARY_RE.test(p));
}
