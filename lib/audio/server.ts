import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { adminSupabase, check, HttpError } from "@/lib/supabase/server";
import { LOOKAHEAD, type AudioAsset, type PlaybackSession, type SessionRow } from "./types";
import { readyChapters } from "./playlist";

export const BUCKET = "chapter-audio";
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function enqueue(id: string, sessionId: string, kind: "prepare" | "synthesize", payload: object) {
  const db = adminSupabase();
  // Synthesis belongs to the asset: closing one device must not cancel work
  // still needed by another device. Only parsing jobs belong to one session.
  check(await db.from("audio_jobs").upsert({ id, session_id: kind === "prepare" ? sessionId : null, kind, payload }, { onConflict: "id", ignoreDuplicates: true }));
}

export async function newSession(userId: string, url: string, voice: string) {
  const token = randomBytes(32).toString("hex");
  const session = check(await adminSupabase().from("playback_sessions").insert({ user_id: userId, token_hash: hash(token), voice }).select().single()) as SessionRow;
  await enqueue(`prepare:${session.id}:0`, session.id, "prepare", { url, ordinal: 0 });
  return { session, token };
}

export async function getSession(id: string, access: { userId: string } | { token: string }) {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new HttpError(404, "Session not found");
  const { data, error } = await adminSupabase().from("playback_sessions").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const s = data as SessionRow | null;
  if (!s || Date.parse(s.expires_at) <= Date.now()) throw new HttpError(410, "Listening session expired. Resume the chapter to continue.");
  const allowed = "userId" in access ? s.user_id === access.userId
    : timingSafeEqual(Buffer.from(hash(access.token)), Buffer.from(s.token_hash));
  if (!allowed) throw new HttpError(403, "Session access denied");
  return s;
}

export async function sessionAssets(id: string): Promise<Array<{ ordinal: number; asset: AudioAsset }>> {
  const rows = check(await adminSupabase().from("session_chapters")
    .select("ordinal, audio_assets(*, audio_chunks(*))").eq("session_id", id).order("ordinal"));
  return (rows ?? []).map((row) => ({ ordinal: row.ordinal, asset: row.audio_assets as unknown as AudioAsset }));
}

export async function extendSession(session: SessionRow) {
  if (session.terminal) return;
  const rows = await sessionAssets(session.id);
  const last = rows.at(-1);
  if (!last) return;
  const nextUrl = last.asset.chapter.nextUrl;
  if (!nextUrl || rows.some((r) => r.asset.chapter.url === nextUrl)) {
    check(await adminSupabase().from("playback_sessions").update({ terminal: true }).eq("id", session.id));
  } else if (last.ordinal < session.requested_ordinal + LOOKAHEAD) {
    await enqueue(`prepare:${session.id}:${last.ordinal + 1}`, session.id, "prepare", { url: nextUrl, ordinal: last.ordinal + 1 });
  }
}

export async function sessionStatus(session: SessionRow, token = ""): Promise<PlaybackSession> {
  const rows = await sessionAssets(session.id);
  const chapters = readyChapters(rows);
  const failed = await failedSessionJobs(session.id, rows.map((r) => r.asset.id));
  return { id: session.id, voice: session.voice,
    playlistUrl: `/api/playback-sessions/${session.id}/manifest?token=${encodeURIComponent(token)}`,
    chapters, preparing: !session.terminal || chapters.length < rows.length,
    terminal: session.terminal && chapters.length === rows.length,
    error: failed?.[0]?.error ? "Audio preparation failed. Use Retry audio to try again." : session.error };
}

export async function failedSessionJobs(sessionId: string, assetIds: string[]) {
  const db = adminSupabase();
  const [parsing, synthesis] = await Promise.all([
    db.from("audio_jobs").select("id,error").eq("session_id", sessionId).eq("state", "failed"),
    assetIds.length ? db.from("audio_jobs").select("id,error").eq("kind", "synthesize").eq("state", "failed").in("payload->>assetId", assetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  return [...(check(parsing) ?? []), ...(check(synthesis) ?? [])];
}
