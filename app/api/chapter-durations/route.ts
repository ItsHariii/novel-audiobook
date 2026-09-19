import { NextRequest, NextResponse } from "next/server";
import { cacheKey, getCached } from "@/lib/hls/cache";
import { normalizeVoice } from "@/lib/tts/voices";
import { apiError, cloudConfigured, requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real per-segment durations measured by /api/tts-segment, or null for
// segments not synthesized yet (or synthesized on another instance). Only
// reads the in-memory cache — never fetches the upstream chapter.
export async function GET(req: NextRequest) {
  if (cloudConfigured()) { try { await requireUser(req); } catch (e) { return apiError(e); } }
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url parameter" }, { status: 400 });
  }
  const voice = normalizeVoice(req.nextUrl.searchParams.get("voice"));
  const cached = getCached(cacheKey(url, voice));
  if (!cached) {
    return NextResponse.json(
      { ok: false, error: "Not cached" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true, durations: cached.segments.map((s) => s.realDuration ?? null) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
