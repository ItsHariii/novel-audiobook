import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

const JUNK_TEXT_RE =
  /^(reading settings|size|spacing|reset to default|tap the text|compact|normal|relaxed|dm sans|lora|jetbrains|comfortaa|previous|next|prev|home|chapter \d+\s*\/\s*\d+)$/i;

const CHAPTER_LABEL_RE = /^\s*(?:chapter|ch\.?|ep|episode)\s*\d+/i;
const TITLE_SEPARATOR_RE = /\s+[-–|—·]\s+/;

export function extractTitles(
  $: CheerioAPI,
  currentUrl: string,
): { title: string; bookTitle?: string; chapterLabel?: string } {
  const h1 = collapseWs($("h1").first().text());
  const docTitle = collapseWs($("title").text());
  const docParts = docTitle
    .split(TITLE_SEPARATOR_RE)
    .map((s) => s.trim())
    .filter(Boolean);

  const chapterLabel = findChapterLabel($, currentUrl, docParts);

  // Book title preference:
  // 1) <h1> if present and not itself a chapter label
  // 2) first <title> part that isn't a chapter label and isn't the last
  //    segment (commonly the site name)
  // 3) fall back to <h1> or first title part
  let bookTitle: string | undefined;
  if (h1 && !CHAPTER_LABEL_RE.test(h1)) {
    bookTitle = h1;
  } else if (docParts.length > 0) {
    const trimmed = docParts.slice(0, -1).filter((p) => !CHAPTER_LABEL_RE.test(p));
    bookTitle = trimmed[0] ?? docParts.find((p) => !CHAPTER_LABEL_RE.test(p));
  }

  const title = bookTitle || h1 || docParts[0] || "Untitled chapter";

  return {
    title,
    bookTitle: bookTitle && bookTitle !== chapterLabel ? bookTitle : undefined,
    chapterLabel: chapterLabel || undefined,
  };
}

function findChapterLabel(
  $: CheerioAPI,
  currentUrl: string,
  docParts: string[],
): string | null {
  // 1) Headings + common chapter-title classes. Pick the longest match so a
  //    rich label ("Chapter 1125 - This Place, This Is Hell.") wins over a
  //    bare "Chapter 1125".
  let best: string | null = null;
  $("h1, h2, h3, h4, .chapter-title, .entry-title, [class*='chapter-title']").each(
    (_, el) => {
      const t = collapseWs($(el).text());
      if (!t || t.length > 200) return;
      if (CHAPTER_LABEL_RE.test(t) && (!best || t.length > best.length)) best = t;
    },
  );
  if (best) return best;

  // 2) Anchor whose href points to the current URL — its text is often the
  //    full chapter label (dropdowns, "you are here" markers, etc.).
  try {
    const cur = new URL(currentUrl);
    let matched: string | null = null;
    $("a").each((_, el) => {
      if (matched) return;
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const u = new URL(href, cur);
        if (u.host !== cur.host) return;
        if (u.pathname.replace(/\/$/, "") !== cur.pathname.replace(/\/$/, "")) return;
        const t = collapseWs($(el).text());
        if (CHAPTER_LABEL_RE.test(t)) matched = t;
      } catch {
        /* ignore */
      }
    });
    if (matched) return matched;
  } catch {
    /* ignore */
  }

  // 3) Fall back to any "Chapter N" piece inside the <title> tag.
  for (const part of docParts) {
    if (CHAPTER_LABEL_RE.test(part)) return part;
  }
  return null;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const MIN_PARAGRAPH_LENGTH = 3;

export function extractParagraphs($: CheerioAPI, scope: Cheerio<AnyNode>): string[] {
  const out: string[] = [];

  scope.find("script, style, nav, button, form, input, select, textarea, svg").remove();

  const paragraphs = scope.find("p");
  if (paragraphs.length >= 3) {
    paragraphs.each((_, el) => {
      const text = cleanText($(el).text());
      if (isLikelyContent(text)) out.push(text);
    });
    if (out.length >= 3) return out;
  }

  // Fallback: walk direct text nodes of block children when <p> isn't used.
  scope.find("div, section, article").each((_, el) => {
    const children = $(el).contents();
    let buffer = "";
    children.each((__, child) => {
      if (child.type === "text") {
        buffer += (child as { data: string }).data;
      } else if (child.type === "tag") {
        const tag = (child as { name: string }).name.toLowerCase();
        if (tag === "br") buffer += "\n";
        else if (["span", "em", "i", "b", "strong", "u", "a"].includes(tag)) {
          buffer += $(child).text();
        } else {
          const t = cleanText(buffer);
          if (isLikelyContent(t)) out.push(t);
          buffer = "";
        }
      }
    });
    const t = cleanText(buffer);
    if (isLikelyContent(t)) out.push(t);
  });

  return out;
}

function cleanText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyContent(text: string): boolean {
  if (!text || text.length < MIN_PARAGRAPH_LENGTH) return false;
  if (JUNK_TEXT_RE.test(text)) return false;
  return true;
}

export function findNavLinks(
  $: CheerioAPI,
  currentUrl: string,
): { nextUrl: string | null; prevUrl: string | null } {
  const base = new URL(currentUrl);
  let nextUrl: string | null = null;
  let prevUrl: string | null = null;

  // Explicit rel=next/prev links
  const relNext = $('link[rel="next"], a[rel="next"]').attr("href");
  const relPrev = $('link[rel="prev"], link[rel="previous"], a[rel="prev"], a[rel="previous"]').attr("href");
  if (relNext) nextUrl = absolutize(relNext, base);
  if (relPrev) prevUrl = absolutize(relPrev, base);

  // Whole-string label match. Length-capped to avoid matching the word "next"
  // or "previous" embedded inside chapter titles (e.g. "We Are Not Next To It").
  const NEXT_LABEL =
    /^(?:next(?:\s+(?:chapter|ep|episode))?(?:\s*[→›»])?|[→›»]\s*next|[→›»])$/i;
  const PREV_LABEL =
    /^(?:prev(?:ious)?(?:\s+(?:chapter|ep|episode))?(?:\s*[←‹«])?|[←‹«]\s*prev(?:ious)?|[←‹«])$/i;
  const isLabel = (s: string, re: RegExp) => {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > 0 && t.length <= 25 && re.test(t);
  };

  $("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href) return;
    const text = $el.text();
    const ariaLabel = $el.attr("aria-label") || "";
    const title = $el.attr("title") || "";

    if (
      !nextUrl &&
      (isLabel(text, NEXT_LABEL) ||
        isLabel(ariaLabel, NEXT_LABEL) ||
        isLabel(title, NEXT_LABEL))
    ) {
      nextUrl = absolutize(href, base);
    }
    if (
      !prevUrl &&
      (isLabel(text, PREV_LABEL) ||
        isLabel(ariaLabel, PREV_LABEL) ||
        isLabel(title, PREV_LABEL))
    ) {
      prevUrl = absolutize(href, base);
    }
  });

  // Heuristic fallback: scan on-page anchors for a sibling URL whose last
  // path segment is the current segment with its embedded chapter number
  // shifted by ±1. Supports two slug shapes:
  //   A) {n}-slug          e.g. /project/1125-foo
  //   B) slug-{n}          e.g. /novel/return-of-the-mount-hua-sect/chapter-1125
  // When both explicit nav and heuristic fail we return null.
  const pathParts = base.pathname.split("/").filter(Boolean);
  const last = pathParts[pathParts.length - 1];
  const prefix = pathParts.slice(0, -1).join("/");

  let num: number | null = null;
  let needleFor: ((n: number) => RegExp) | null = null;

  const matchA = last?.match(/^(\d+)-(.+)$/);
  const matchB = last?.match(/^(.+?)-(\d+)$/);
  if (matchA) {
    num = parseInt(matchA[1], 10);
    needleFor = (n) => new RegExp(`^/?${escapeRegex(prefix)}/${n}-`);
  } else if (matchB) {
    num = parseInt(matchB[2], 10);
    const slug = matchB[1];
    needleFor = (n) =>
      new RegExp(`^/?${escapeRegex(prefix)}/${escapeRegex(slug)}-${n}/?$`);
  }

  if (num !== null && needleFor) {
    if (!nextUrl) {
      const candidate = findSameProjectLinkByPattern($, base, needleFor(num + 1));
      if (candidate) nextUrl = candidate;
    }
    if (!prevUrl && num > 1) {
      const candidate = findSameProjectLinkByPattern($, base, needleFor(num - 1));
      if (candidate) prevUrl = candidate;
    }
  }

  return { nextUrl, prevUrl };
}

function findSameProjectLinkByPattern(
  $: CheerioAPI,
  base: URL,
  needle: RegExp,
): string | null {
  let found: string | null = null;
  $("a").each((_, el) => {
    if (found) return;
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href, base);
      if (u.host !== base.host) return;
      if (needle.test(u.pathname)) {
        found = u.toString();
      }
    } catch {
      /* ignore */
    }
  });
  return found;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function absolutize(href: string, base: URL): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
