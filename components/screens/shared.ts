/** What the player is on right now, in chapter-relative seconds. */
export interface NowPlaying {
  url: string;
  title: string;
  chapterLabel?: string;
  bookTitle: string;
  source: string;
  coverSeed: string;
  coverUrl?: string;
  elapsed: number;
  duration: number;
  percent: number;
}

/** Audio preparation for the open chapter, as shown on Home. */
export interface NarrationSummary {
  title: string;
  detail: string;
  done: boolean;
  failed: boolean;
}

/** Where the audio for the open chapter stands. */
export type AudioState = "none" | "preparing" | "ready" | "playing" | "failed";
