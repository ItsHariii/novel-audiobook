import { Agent, fetch as undiciFetch } from "undici";
import type { Chapter } from "../types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const dispatcher = new Agent({ allowH2: true });

const ORIGIN = "https://novtales.com";
const TIMEOUT_MS = 8000;

interface ChapterRow {
  _id: string;
  Slug: string;
  "Chapter Title"?: string;
  "Chapter Number"?: number;
  "Chapter Content Pointer"?: string;
  "Next Chapter Slug"?: string;
  "Prev Chapter Slug"?: string;
  Novel?: string;
}

interface ChapterContentResp {
  response: {
    "Chapter Text"?: string;
  };
}

interface NovelResp {
  response: {
    Name?: string;
  };
}

interface ChapterListResp {
  response: {
    results: ChapterRow[];
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await undiciFetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`novtales upstream ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function extractSlug(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== "chapter" || !parts[1]) return null;
    return decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
}

function chapterTextToParagraphs(text: string): string[] {
  const paras = text
    .split(/\n{2,}/)
    .map((s) => s.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);
  // First block is usually the "Chapter N: Title" heading — drop it, we surface
  // that via chapterLabel separately.
  if (paras.length > 0 && /^chapter\s+\d+\s*[:\-]/i.test(paras[0])) {
    paras.shift();
  }
  return paras;
}

export async function fetchNovtales(url: string): Promise<Chapter> {
  const slug = extractSlug(url);
  if (!slug) throw new Error("novtales: could not parse chapter slug from URL");

  const constraints = encodeURIComponent(
    JSON.stringify([
      { key: "Slug", constraint_type: "equals", value: slug },
    ]),
  );
  const list = await getJson<ChapterListResp>(
    `${ORIGIN}/api/1.1/obj/chapter?constraints=${constraints}`,
  );
  const row = list.response.results[0];
  if (!row) throw new Error(`novtales: chapter not found for slug "${slug}"`);

  const contentId = row["Chapter Content Pointer"];
  if (!contentId) throw new Error("novtales: chapter has no content pointer");

  const [content, novel] = await Promise.all([
    getJson<ChapterContentResp>(
      `${ORIGIN}/api/1.1/obj/chaptercontent/${contentId}`,
    ),
    row.Novel
      ? getJson<NovelResp>(`${ORIGIN}/api/1.1/obj/novel/${row.Novel}`).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);

  const text = content.response["Chapter Text"] ?? "";
  const paragraphs = chapterTextToParagraphs(text);

  const bookTitle = novel?.response.Name;
  const chapterNum = row["Chapter Number"];
  const chapterTitle = row["Chapter Title"];
  const chapterLabel =
    chapterNum != null
      ? `Chapter ${chapterNum}${chapterTitle ? `: ${chapterTitle}` : ""}`
      : chapterTitle;

  const nextSlug = row["Next Chapter Slug"];
  const prevSlug = row["Prev Chapter Slug"];

  return {
    url,
    title: bookTitle || chapterTitle || `Chapter ${chapterNum ?? ""}`.trim(),
    paragraphs,
    nextUrl: nextSlug ? `${ORIGIN}/chapter/${nextSlug}` : null,
    prevUrl: prevSlug ? `${ORIGIN}/chapter/${prevSlug}` : null,
    source: "novtales.com",
    bookTitle: bookTitle || undefined,
    chapterLabel: chapterLabel || undefined,
  };
}
