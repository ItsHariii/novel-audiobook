import { apiError, HttpError } from "@/lib/supabase/server";
import { extendSession, getSession, sessionAssets } from "@/lib/audio/server";
import { eventPlaylist, readyChapters } from "@/lib/audio/playlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const session = await getSession((await context.params).id, { token });
    await extendSession(session);
    const rows = await sessionAssets(session.id);
    const chapters = readyChapters(rows);
    if (!chapters.length) throw new HttpError(503, "Preparing audio");
    const stop = new URL(req.url).searchParams.get("stop");
    const stopAt = stop === null ? Infinity : Number(stop);
    if (!(stopAt > 0)) throw new HttpError(400, "Invalid stop position");
    return new Response(eventPlaylist(chapters, rows, session.id, token, stopAt),
      { headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
