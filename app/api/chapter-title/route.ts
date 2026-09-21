import { NextRequest, NextResponse } from "next/server";
import { ChapterFetchError, loadChapterTitles } from "@/lib/hls/parse";
import { apiError, cloudConfigured, requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (cloudConfigured()) {
    try {
      await requireUser(req);
    } catch (e) {
      return apiError(e);
    }
  }
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const titles = await loadChapterTitles(url);
    return NextResponse.json(
      { ok: true, ...titles },
      {
        headers: {
          "Cache-Control": cloudConfigured() ? "private, no-store" : "public, max-age=300",
        },
      },
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
