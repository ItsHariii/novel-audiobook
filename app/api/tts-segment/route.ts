import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { ChapterFetchError, loadChapter } from "@/lib/hls/parse";
import type { CachedSegment } from "@/lib/hls/cache";
import { normalizeVoice } from "@/lib/tts/voices";
import { apiError, cloudConfigured, HttpError } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TEXT_LENGTH = 3000;
// AUDIO_24KHZ_48KBITRATE_MONO_MP3 is constant bitrate: 48 kbit/s = 6000 B/s.
const BYTES_PER_SECOND = 6000;

export async function GET(req: NextRequest) {
  if (cloudConfigured()) return apiError(new HttpError(410, "Use an authenticated playback session."));
  const url = req.nextUrl.searchParams.get("url");
  const iStr = req.nextUrl.searchParams.get("i");
  if (!url || iStr === null) {
    return NextResponse.json(
      { ok: false, error: "Missing url or i parameter" },
      { status: 400 },
    );
  }
  const i = Number.parseInt(iStr, 10);
  if (!Number.isFinite(i) || i < 0) {
    return NextResponse.json({ ok: false, error: "Invalid i parameter" }, { status: 400 });
  }
  const voice = normalizeVoice(req.nextUrl.searchParams.get("voice"));

  let text: string;
  let segment: CachedSegment | undefined;
  try {
    const { cached } = await loadChapter(url, voice);
    segment = cached.segments[i];
    if (!segment) {
      return NextResponse.json(
        { ok: false, error: `Segment ${i} out of range` },
        { status: 404 },
      );
    }
    text = segment.text;
  } catch (err) {
    if (err instanceof ChapterFetchError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { ok: false, error: `Parse failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
  }

  let tts: MsEdgeTTS;
  try {
    tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `TTS init failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  let audioStream: NodeJS.ReadableStream;
  try {
    ({ audioStream } = tts.toStream(text));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `TTS stream failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  let bytes = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      audioStream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        controller.enqueue(new Uint8Array(chunk));
      });
      audioStream.on("end", () => {
        // Record the true length so playlists and the client's chunk timeline
        // stop relying on the chars-per-second estimate for this segment.
        if (segment && bytes > 0) segment.realDuration = bytes / BYTES_PER_SECOND;
        controller.close();
      });
      audioStream.on("close", () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      audioStream.on("error", (err: Error) => {
        controller.error(err);
      });
    },
    cancel() {
      try {
        (audioStream as unknown as { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
