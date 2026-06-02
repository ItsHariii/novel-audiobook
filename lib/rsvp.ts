export interface RsvpWord {
  word: string;
  chunkIndex: number;
}

export function tokenizeChunks(
  chunks: Array<{ index: number; text: string }>,
): RsvpWord[] {
  const out: RsvpWord[] = [];
  for (const c of chunks) {
    const matches = c.text.match(/\S+/g);
    if (!matches) continue;
    for (const w of matches) out.push({ word: w, chunkIndex: c.index });
  }
  return out;
}

// Spritz-style Optimal Recognition Point: char index of the pivot letter.
export function orpIndex(word: string): number {
  const len = word.length;
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

export function findWordIndexForChunk(
  words: RsvpWord[],
  chunkIndex: number,
): number {
  for (let i = 0; i < words.length; i++) {
    if (words[i].chunkIndex >= chunkIndex) return i;
  }
  return Math.max(0, words.length - 1);
}
