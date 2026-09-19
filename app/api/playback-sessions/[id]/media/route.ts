import { adminSupabase, apiError, check, HttpError } from "@/lib/supabase/server";
import { BUCKET, extendSession, getSession } from "@/lib/audio/server";
import type { AudioChunk } from "@/lib/audio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const query = new URL(req.url).searchParams;
    const session = await getSession((await context.params).id, { token: query.get("token") ?? "" });
    const indexes = ["chapter", "chunk", "part"].map((key) => query.get(key));
    if (indexes.some((v) => v === null || !/^\d{1,7}$/.test(v))) throw new HttpError(400, "Invalid media index");
    const [ordinal, chunkIndex, partIndex] = indexes.map(Number);
    const db = adminSupabase();
    const chapter = check(await db.from("session_chapters").select("asset_id").eq("session_id", session.id).eq("ordinal", ordinal).maybeSingle());
    if (!chapter) throw new HttpError(404, "Chapter not prepared");
    const chunk = check(await db.from("audio_chunks").select().eq("asset_id", chapter.asset_id).eq("chunk_index", chunkIndex).maybeSingle()) as AudioChunk | null;
    const part = chunk?.parts[partIndex];
    if (!part) throw new HttpError(404, "Audio not prepared");
    if (ordinal > session.requested_ordinal) {
      check(await db.rpc("audio_demand", { sid: session.id, ordinal }));
      await extendSession({ ...session, requested_ordinal: ordinal });
    }
    const signed = check(await db.storage.from(BUCKET).createSignedUrl(part.path, 3600));
    if (!signed) throw new HttpError(503, "Audio storage is unavailable");
    // The native HLS engine follows this redirect with Range headers as needed.
    return new Response(null, { status: 307, headers: { Location: signed.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
