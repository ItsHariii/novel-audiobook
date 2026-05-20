import { NextRequest } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { normalizeVoice } from "@/lib/tts/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TEXT_LENGTH = 3000;

function parseBody(body: unknown): { text: string; voice: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.text !== "string" || b.text.trim().length === 0) return null;
  if (b.text.length > MAX_TEXT_LENGTH) return null;
  return { text: b.text, voice: normalizeVoice(b.voice) };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return new Response(JSON.stringify({ error: "Missing or empty 'text'" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let tts: MsEdgeTTS;
  try {
    tts = new MsEdgeTTS();
    await tts.setMetadata(
      parsed.voice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `TTS init failed: ${(err as Error).message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let audioStream: NodeJS.ReadableStream;
  try {
    ({ audioStream } = tts.toStream(parsed.text));
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `TTS stream failed: ${(err as Error).message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      audioStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      audioStream.on("end", () => {
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
      "Cache-Control": "public, max-age=3600",
    },
  });
}
