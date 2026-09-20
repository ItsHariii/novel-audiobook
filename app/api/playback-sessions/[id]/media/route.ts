import { adminSupabase, apiError, check, HttpError } from "@/lib/supabase/server";
import { BUCKET, extendSession, getSession } from "@/lib/audio/server";
import { retimestamp } from "@/lib/audio/mp3";
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

    // Session-absolute start of this segment — same accumulation as eventPlaylist.
    let offset = 0;
    if (ordinal > 0) {
      const prior = check(await db.from("session_chapters")
        .select("audio_assets(audio_chunks(duration))")
        .eq("session_id", session.id)
        .lt("ordinal", ordinal)) ?? [];
      for (const row of prior) {
        const joined = row.audio_assets as unknown;
        const asset = (Array.isArray(joined) ? joined[0] : joined) as { audio_chunks: Array<{ duration: number }> } | null;
        if (asset?.audio_chunks) offset += asset.audio_chunks.reduce((sum, c) => sum + c.duration, 0);
      }
    }
    if (chunkIndex > 0) {
      const priorChunks = check(await db.from("audio_chunks")
        .select("duration")
        .eq("asset_id", chapter.asset_id)
        .lt("chunk_index", chunkIndex)) ?? [];
      offset += priorChunks.reduce((sum, c) => sum + c.duration, 0);
    }
    for (let i = 0; i < partIndex; i++) offset += chunk!.parts[i].duration;

    const blob = check(await db.storage.from(BUCKET).download(part.path));
    if (!blob) throw new HttpError(503, "Audio storage is unavailable");
    const buffer = retimestamp(Buffer.from(await blob.arrayBuffer()), offset);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) { return apiError(error); }
}
