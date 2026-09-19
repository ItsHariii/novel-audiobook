import type { ChapterProgress, ProgressRecord } from "./types";

export interface LocalProgress {
  record?: ProgressRecord;
  pending?: ChapterProgress;
  importing?: boolean;
  modifiedAt?: number;
  conflict?: ProgressRecord;
}
export type ProgressMap = Record<string, LocalProgress>;

export function acknowledge(local: LocalProgress, sent: ChapterProgress, remote: ProgressRecord, accepted: boolean): LocalProgress {
  if (!accepted && !local.importing) return { ...local, conflict: remote };
  return {
    record: remote,
    modifiedAt: local.modifiedAt,
    pending: local.importing || JSON.stringify(local.pending) === JSON.stringify(sent) ? undefined : local.pending,
  };
}

export function writeLegacyPosition(p: ChapterProgress) {
  localStorage.setItem(`nab:pos:${p.chapterUrl}`, JSON.stringify({ time: p.audioTime, voice: p.voice }));
  localStorage.setItem(`nab:rsvp:${p.chapterUrl}`, JSON.stringify({ wordIndex: p.wordIndex }));
  localStorage.setItem(`nab:reader:${p.chapterUrl}`, JSON.stringify({ chunk: p.readerChunk, offset: p.readerOffset }));
}
