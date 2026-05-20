export const DEFAULT_VOICE = "en-US-AvaNeural";

export const ALLOWED_VOICES = new Set([
  "en-US-AvaNeural",
  "en-US-AndrewNeural",
  "en-US-EmmaNeural",
  "en-US-BrianNeural",
  "en-GB-SoniaNeural",
  "en-GB-RyanNeural",
  "en-US-GuyNeural",
  "en-US-JennyNeural",
]);

export function normalizeVoice(voice: unknown): string {
  return typeof voice === "string" && ALLOWED_VOICES.has(voice) ? voice : DEFAULT_VOICE;
}
