import { after } from "next/server";
import { adminSupabase, apiError, check, HttpError, requireUser } from "@/lib/supabase/server";
import { extendSession, failedSessionJobs, getSession, sessionAssets, sessionStatus } from "@/lib/audio/server";
import { runAudioWorker } from "@/lib/audio/worker";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Context) {
  try {
    const user = await requireUser(req);
    const session = await getSession((await context.params).id, { userId: user.id });
    await extendSession(session);
    const status = await sessionStatus(session);
    if (!status.chapters.length && !status.error) {
      after(async () => { try { await runAudioWorker(); } catch (e) { console.error("[tome] preparation failed", e); } });
    }
    return Response.json(status, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PATCH(req: Request, context: Context) {
  try {
    const user = await requireUser(req);
    const session = await getSession((await context.params).id, { userId: user.id });
    const { action } = await req.json();
    const db = adminSupabase();
    if (action === "close") {
      check(await db.from("playback_sessions").update({ expires_at: new Date().toISOString() }).eq("id", session.id));
    } else if (action === "retry") {
      const rows = await sessionAssets(session.id);
      const jobs = await failedSessionJobs(session.id, rows.map((r) => r.asset.id));
      if (jobs.length) check(await db.from("audio_jobs").update({ state: "queued", attempts: 0, error: null, available_at: new Date().toISOString() }).in("id", jobs.map((j) => j.id)).eq("state", "failed"));
      after(async () => { try { await runAudioWorker(); } catch (e) { console.error("[tome] retry failed", e); } });
    } else throw new HttpError(400, "Unknown session action");
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
