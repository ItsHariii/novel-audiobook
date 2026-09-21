import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, apiError, check, HttpError, requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove chapters from the signed-in reader's library. Books left with no
 * chapters go too. Rows are only ever matched against the caller's own id.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => null)) as { urls?: unknown } | null;
    const urls = Array.isArray(body?.urls) ? body.urls.filter((u): u is string => typeof u === "string" && u.length <= 4096) : [];
    if (urls.length === 0 || urls.length > 5000) throw new HttpError(400, "Nothing to remove");
    const db = adminSupabase();
    const keys = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const rows = check(await db.from("chapter_progress").delete().eq("user_id", user.id).in("chapter_url", urls.slice(i, i + 200)).select("book_key"));
      for (const row of rows as Array<{ book_key: string }>) keys.add(row.book_key);
    }
    if (keys.size > 0) {
      const remaining = check(await db.from("chapter_progress").select("book_key").eq("user_id", user.id).in("book_key", [...keys]));
      const kept = new Set((remaining as Array<{ book_key: string }>).map((r) => r.book_key));
      const empty = [...keys].filter((k) => !kept.has(k));
      if (empty.length > 0) check(await db.from("books").delete().eq("user_id", user.id).in("book_key", empty));
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
