import { NextRequest, NextResponse } from "next/server";
import { apiError, cloudConfigured, HttpError, requireUser } from "@/lib/supabase/server";
import { coverProxyPath, coverSecret, resolveCover } from "@/lib/covers/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Find a cover for the book a chapter belongs to; returns a signed proxy path or null. */
export async function GET(req: NextRequest) {
  try {
    if (cloudConfigured()) await requireUser(req);
    const url = req.nextUrl.searchParams.get("url");
    const title = req.nextUrl.searchParams.get("title")?.slice(0, 300) || null;
    if (!url) throw new HttpError(400, "Missing url");
    let target: URL;
    try { target = new URL(url); } catch { throw new HttpError(400, "Invalid url"); }
    if (!/^https?:$/.test(target.protocol)) throw new HttpError(400, "Only http(s) URLs are allowed");
    const secret = coverSecret();
    const src = await resolveCover(target.toString(), title);
    return NextResponse.json({ ok: true, cover: src ? coverProxyPath(src, secret) : null },
      { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return apiError(e);
  }
}
