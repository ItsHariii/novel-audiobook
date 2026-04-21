import type { Chapter } from "../types";
import { parseGeneric } from "./generic";
import { parseSkyDemonOrder } from "./skydemonorder";

type Adapter = (html: string, url: string) => Chapter;

const adapters: Record<string, Adapter> = {
  "skydemonorder.com": parseSkyDemonOrder,
};

export function pickAdapter(url: string): Adapter {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return adapters[host] ?? parseGeneric;
  } catch {
    return parseGeneric;
  }
}
