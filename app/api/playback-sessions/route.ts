import { after } from "next/server";
import { z } from "zod";
import { apiError, requireUser, HttpError } from "@/lib/supabase/server";
import { newSession, sessionStatus } from "@/lib/audio/server";
import { runAudioWorker } from "@/lib/audio/worker";
import { normalizeVoice } from "@/lib/tts/voices";

export const runtime = "nodejs";
export const maxDuration = 60;
const input = z.object({ url: z.url().max(4096).refine((v) => /^https?:\/\//.test(v)), voice: z.string().max(100) });

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const parsed = input.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "Enter a valid chapter URL.");
    const { session, token } = await newSession(user.id, parsed.data.url, normalizeVoice(parsed.data.voice));
    after(async () => { try { await runAudioWorker(); } catch (e) { console.error("[tome] worker kickoff failed", e); } });
    return Response.json(await sessionStatus(session, token), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
