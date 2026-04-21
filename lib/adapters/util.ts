import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

const JUNK_TEXT_RE =
  /^(reading settings|size|spacing|reset to default|tap the text|compact|normal|relaxed|dm sans|lora|jetbrains|comfortaa|previous|next|prev|home|chapter \d+\s*\/\s*\d+)$/i;

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

  // Text-based search through anchors
  $("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href) return;
    const text = $el.text().trim().toLowerCase();
    const ariaLabel = ($el.attr("aria-label") || "").trim().toLowerCase();
    const title = ($el.attr("title") || "").trim().toLowerCase();

    const all = `${text} ${ariaLabel} ${title}`;
    if (!nextUrl && /(^|\s)(next|next chapter|next ep|next episode|→|›|»)(\s|$)/i.test(all)) {
      nextUrl = absolutize(href, base);
    }
    if (!prevUrl && /(^|\s)(prev|previous|previous chapter|prev chapter|prev ep|previous ep|←|‹|«)(\s|$)/i.test(all)) {
      prevUrl = absolutize(href, base);
    }
  });

  // Heuristic fallback: for URLs of the form /.../{n}-slug try {n+1}-slug and
  // {n-1}-slug. This only works if the site preserves slug structure; when
  // both explicit and heuristic fail we simply return null.
  const pathParts = base.pathname.split("/").filter(Boolean);
  const last = pathParts[pathParts.length - 1];
  const match = last?.match(/^(\d+)-(.+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const prefix = pathParts.slice(0, -1).join("/");
    if (!nextUrl) {
      const candidate = findSameProjectLinkByNumber($, base, prefix, num + 1);
      if (candidate) nextUrl = candidate;
    }
    if (!prevUrl && num > 1) {
      const candidate = findSameProjectLinkByNumber($, base, prefix, num - 1);
      if (candidate) prevUrl = candidate;
    }
  }

  return { nextUrl, prevUrl };
}

function findSameProjectLinkByNumber(
  $: CheerioAPI,
  base: URL,
  projectPrefix: string,
  chapterNumber: number,
): string | null {
  let found: string | null = null;
  const needle = new RegExp(`^/?${escapeRegex(projectPrefix)}/${chapterNumber}-`);
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
