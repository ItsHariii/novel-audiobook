import { NextRequest, NextResponse } from "next/server";
import { apiError, cloudConfigured, HttpError, requireUser } from "@/lib/supabase/server";
import { loadComic } from "@/lib/comics/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** One comic chapter: series, chapter label, page images and neighbours. */
export async function GET(req: NextRequest) {
  try {
    if (cloudConfigured()) await requireUser(req);
    const url = req.nextUrl.searchParams.get("url");
    if (!url || url.length > 4096) throw new HttpError(400, "Missing url");
    const chapter = await loadComic(url);
    return NextResponse.json({ ok: true, chapter }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
