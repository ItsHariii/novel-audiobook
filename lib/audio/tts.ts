import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export async function synthesize(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(text);
        const buffers: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of audioStream) {
          const buffer = Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > 5_000_000) throw new Error("TTS response exceeded the chunk limit");
          buffers.push(buffer);
        }
        return Buffer.concat(buffers);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { tts.close(); reject(new Error("Audio generation timed out")); }, 25_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    tts.close();
  }
}
