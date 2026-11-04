import type { ComicChapter } from "../types";
import { parseAsura } from "./asura";
import { parseGenericComic } from "./generic";

type ComicAdapter = (html: string, url: string) => ComicChapter;

const adapters: Record<string, ComicAdapter> = {
  "asurascans.com": parseAsura,
  "asuracomic.net": parseAsura,
};

/** Sites known to serve page images to any referer; others go through our proxy. */
const HOTLINK_OK = new Set(Object.keys(adapters));

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function pickComicAdapter(url: string): ComicAdapter {
  return adapters[hostOf(url)] ?? parseGenericComic;
}

export function hotlinkAllowed(url: string): boolean {
  return HOTLINK_OK.has(hostOf(url));
}
