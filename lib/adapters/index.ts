import type { Chapter } from "../types";
import { parseGeneric } from "./generic";
import { parseSkyDemonOrder } from "./skydemonorder";
import { fetchNovtales } from "./novtales";

type HtmlAdapter = (html: string, url: string) => Chapter;
type CustomFetcher = (url: string) => Promise<Chapter>;

const htmlAdapters: Record<string, HtmlAdapter> = {
  "skydemonorder.com": parseSkyDemonOrder,
};

// Sites whose chapter body is rendered client-side (e.g. Bubble.io SPAs) can't
// be parsed from raw HTML. They expose JSON APIs that we hit directly instead
// of fetching the HTML shell.
const customFetchers: Record<string, CustomFetcher> = {
  "novtales.com": fetchNovtales,
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function pickAdapter(url: string): HtmlAdapter {
  const host = hostOf(url);
  if (!host) return parseGeneric;
  return htmlAdapters[host] ?? parseGeneric;
}

export function pickCustomFetcher(url: string): CustomFetcher | null {
  const host = hostOf(url);
  if (!host) return null;
  return customFetchers[host] ?? null;
}
