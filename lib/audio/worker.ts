import "server-only";
import { adminSupabase, check } from "@/lib/supabase/server";
import { loadChapter } from "@/lib/hls/parse";
import { BUCKET, enqueue, extendSession, hash } from "./server";
import { synthesize } from "./tts";
import { packMp3 } from "./mp3";
import type { AudioAsset, AudioPart } from "./types";

interface Job {
  id: string;
  session_id: string | null;
  kind: "prepare" | "synthesize";
  payload: { url: string; ordinal: number; assetId: string; chunkIndex: number; generation: string };
  lease_token: string;
  attempts: number;
}

async function prepare(job: Job) {
  if (!job.session_id) throw new Error("Missing preparation session");
  const db = adminSupabase();
  const session = check(await db.from("playback_sessions").select().eq("id", job.session_id).single());
  const { cached } = await loadChapter(job.payload.url, session.voice);
  const chunks = cached.segments.map((s) => s.text);
  const id = hash(JSON.stringify([session.user_id, cached.chapter.url, chunks, session.voice, "packed-mp3-v1"]));
  check(await db.from("audio_assets").upsert({ id, user_id: session.user_id, chapter: cached.chapter, voice: session.voice, chunks }, { onConflict: "id", ignoreDuplicates: true }));
  const stored = check(await db.from("audio_assets").select("generation").eq("id", id).single());
  if (!stored) throw new Error("Audio asset was evicted; retrying");
  check(await db.from("audio_assets").update({ last_used_at: new Date().toISOString() }).eq("id", id));
  check(await db.from("session_chapters").upsert({ session_id: session.id, ordinal: job.payload.ordinal, asset_id: id }, { onConflict: "session_id,ordinal", ignoreDuplicates: true }));
  const ready = check(await db.from("audio_chunks").select("chunk_index").eq("asset_id", id)) ?? [];
  const completed = new Set(ready.map((c) => c.chunk_index));
  for (let i = 0; i < chunks.length; i++) {
    if (!completed.has(i)) await enqueue(`synth:${id}:${stored.generation}:${i}`, session.id, "synthesize", { assetId: id, generation: stored.generation, chunkIndex: i, ordinal: job.payload.ordinal });
  }
  await extendSession(session);
}

export async function cleanAudioCache(incoming = 0) {
  const db = adminSupabase();
  // Expired capability URLs can no longer refer to these session rows.
  check(await db.from("playback_sessions").delete().lt("expires_at", new Date().toISOString()));
  const limit = Number(process.env.AUDIO_CACHE_MAX_BYTES || 750_000_000);
  if (!Number.isFinite(limit) || limit < 1) throw new Error("Invalid AUDIO_CACHE_MAX_BYTES");
  let total = Number(check(await db.rpc("audio_cache_bytes")));
  const started = Date.now();
  // Audio/text assets are a temporary listening buffer, not a book archive.
  // A short grace period lets a preparing worker attach a newly-created asset
  // before another worker considers it abandoned.
  const orphanCutoff = Date.now() - 2 * 60_000;
  while (Date.now() - started < 10_000) {
    const assets = check(await db.rpc("audio_cache_candidates")) as Array<{ id: string; generation: string; bytes: number }>;
    if (!assets.length) break;
    const metadata = check(await db.from("audio_assets").select("id,last_used_at").in("id", assets.map((a) => a.id))) ?? [];
    const lastUsed = new Map(metadata.map((a) => [a.id, Date.parse(a.last_used_at)]));
    let removed = false;
    for (const asset of assets) {
      if (total + incoming <= limit && (lastUsed.get(asset.id) ?? Infinity) > orphanCutoff) continue;
      const retired = check(await db.rpc("retire_audio_asset", { asset: asset.id, incarnation: asset.generation }));
      if (!retired) continue;
      removed = true;
      total -= Number(asset.bytes);
    }
    if (!removed) break;
  }
  await collectGarbage();
  // Report quota errors from the claimed synthesis job so its retry/error state
  // is visible to the player; idle housekeeping must not block job claiming.
  if (incoming > 0 && total + incoming > limit) throw new Error("Audio cache is full. Close unused listening sessions and retry.");
}

async function collectGarbage() {
  const db = adminSupabase();
  const rows = check(await db.from("audio_gc").select().limit(20)) ?? [];
  for (const row of rows) {
    const paths = row.paths as string[];
    for (let i = 0; i < paths.length; i += 100) check(await db.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
    check(await db.from("audio_gc").delete().eq("id", row.id));
  }
}

async function generate(job: Job) {
  const db = adminSupabase();
  const { assetId, chunkIndex } = job.payload;
  const existing = check(await db.from("audio_chunks").select("asset_id").eq("asset_id", assetId).eq("chunk_index", chunkIndex).maybeSingle());
  if (existing) return;
  const asset = check(await db.from("audio_assets").select().eq("id", assetId).single()) as AudioAsset;
  if (asset.generation !== job.payload.generation) return;
  const packed = packMp3(await synthesize(asset.chunks[chunkIndex], asset.voice));
  const bytes = packed.reduce((sum, p) => sum + p.data.length, 0);
  await cleanAudioCache(bytes);
  const parts: AudioPart[] = [];
  try {
    for (const [index, part] of packed.entries()) {
      const path = `${asset.user_id}/${asset.id}/${asset.generation}/${chunkIndex}/${index}.mp3`;
      check(await db.storage.from(BUCKET).upload(path, part.data, { contentType: "audio/mpeg", cacheControl: "86400", upsert: true }));
      parts.push({ path, duration: part.duration });
    }
    check(await db.from("audio_chunks").insert({ asset_id: assetId, chunk_index: chunkIndex, parts,
      duration: parts.reduce((sum, p) => sum + p.duration, 0), bytes }));
  } catch (error) {
    // Partial uploads were never published. Remove them before retrying.
    if (parts.length) await db.storage.from(BUCKET).remove(parts.map((p) => p.path));
    throw error;
  }
  check(await db.from("audio_assets").update({ last_used_at: new Date().toISOString() }).eq("id", assetId));
}

export async function runAudioWorker() {
  const db = adminSupabase();
  await cleanAudioCache();
  const job = check(await db.rpc("claim_audio_job")) as Job | null;
  if (!job) return false;
  const started = Date.now();
  try {
    if (job.kind === "prepare") await prepare(job);
    else await generate(job);
    check(await db.from("audio_jobs").update({ state: "done", lease_until: null, error: null }).eq("id", job.id).eq("lease_token", job.lease_token));
    console.info("[tome] audio job ready", { kind: job.kind, ms: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audio preparation failed";
    console.error("[tome] audio job failed", { id: job.id, attempt: job.attempts, message });
    check(await db.from("audio_jobs").update({ state: job.attempts >= 3 ? "failed" : "queued", error: message,
      lease_until: null, available_at: new Date(Date.now() + 5000 * 2 ** job.attempts).toISOString() })
      .eq("id", job.id).eq("lease_token", job.lease_token));
  }
  return true;
}
