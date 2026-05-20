import { NextRequest, NextResponse } from "next/server";
import { ChapterFetchError, loadChapter } from "@/lib/hls/parse";
import { normalizeVoice } from "@/lib/tts/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url parameter" }, { status: 400 });
  }
  const voice = normalizeVoice(req.nextUrl.searchParams.get("voice"));

  try {
    const { key, cached } = await loadChapter(url, voice);
    return NextResponse.json(
      {
        ok: true,
        key,
        voice,
        chapter: cached.chapter,
        chunks: cached.segments.map((s, i) => ({
          index: i,
          text: s.text,
          estDuration: s.estDuration,
        })),
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    if (err instanceof ChapterFetchError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { ok: false, error: `Parse failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
