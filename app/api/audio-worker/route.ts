import { timingSafeEqual } from "node:crypto";
import { apiError, HttpError } from "@/lib/supabase/server";
import { runAudioWorker } from "@/lib/audio/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const secret = process.env.AUDIO_WORKER_SECRET;
    const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!secret || supplied.length !== secret.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
      throw new HttpError(401, "Unauthorized");
    }
    const processed = await runAudioWorker();
    return Response.json({ ok: true, processed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
