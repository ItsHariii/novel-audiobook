// Packed MP3 HLS: measure frame sample counts, never infer time from file bytes.
// MPEG audio header rules: ISO/IEC 11172-3 / 13818-3, HLS RFC 8216 §3.4.
const MPEG1_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function syncSafe(n: number) {
  return Buffer.from([(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127]);
}

export function timestampTag(seconds: number): Buffer {
  const owner = Buffer.from("com.apple.streaming.transportStreamTimestamp\0");
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.round(seconds * 90000)) % (1n << 33n));
  const body = Buffer.concat([owner, timestamp]);
  const frame = Buffer.concat([Buffer.from("PRIV"), syncSafe(body.length), Buffer.alloc(2), body]);
  return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0]), syncSafe(frame.length), frame]);
}

export function packMp3(input: Buffer): Array<{ data: Buffer; duration: number }> {
  let offset = 0;
  if (input.subarray(0, 3).toString() === "ID3") {
    const size = ((input[6] & 127) << 21) | ((input[7] & 127) << 14) | ((input[8] & 127) << 7) | (input[9] & 127);
    offset = 10 + size + (input[5] & 0x10 ? 10 : 0);
  }
  const parts: Array<{ data: Buffer; duration: number }> = [];
  let frames: Buffer[] = [];
  let duration = 0;
  let elapsed = 0;
  const flush = () => {
    if (!frames.length) return;
    duration = Number(duration.toFixed(9));
    parts.push({ data: Buffer.concat([timestampTag(elapsed), ...frames]), duration });
    elapsed += duration;
    frames = [];
    duration = 0;
  };
  while (offset < input.length) {
    if (input.length - offset === 128 && input.subarray(offset, offset + 3).toString() === "TAG") break;
    if (input.length - offset < 4) throw new Error("Truncated MP3 header");
    const h = input.readUInt32BE(offset);
    const version = (h >>> 19) & 3;
    const layer = (h >>> 17) & 3;
    const bitrateIndex = (h >>> 12) & 15;
    const sampleIndex = (h >>> 10) & 3;
    if ((h & 0xffe00000) >>> 0 !== 0xffe00000 || version === 1 || layer !== 1 || !bitrateIndex || bitrateIndex === 15 || sampleIndex === 3) {
      throw new Error("Unsupported or corrupt MP3 frame");
    }
    const sampleRate = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const bitrate = (version === 3 ? MPEG1_BITRATES : MPEG2_BITRATES)[bitrateIndex];
    const size = Math.floor((version === 3 ? 144000 : 72000) * bitrate / sampleRate) + ((h >>> 9) & 1);
    if (offset + size > input.length) throw new Error("Truncated MP3 frame");
    const seconds = (version === 3 ? 1152 : 576) / sampleRate;
    if (duration + seconds > 6 + 1e-9) flush();
    frames.push(input.subarray(offset, offset + size));
    duration += seconds;
    offset += size;
  }
  flush();
  if (!parts.length) throw new Error("TTS returned empty audio");
  return parts;
}
