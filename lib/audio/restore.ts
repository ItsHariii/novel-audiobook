// A queued seek, applied once the replacement media reports its metadata.
//
// `time` is seconds into the attached playlist, which means two different things
// depending on the playlist: absolute on the session timeline when `sessionId`
// is set, chapter-relative otherwise. They are not interchangeable, so a
// restore carries enough identity to prove which timeline produced it.
export type PendingRestore = { chapter: string; time: number; sessionId?: string; at: number };

// Whether a queued restore belongs to the media that just loaded. Matching a
// session time by chapter URL alone used to seek an absolute position into a
// different session's timeline, landing playback in an earlier chapter.
export function restoreApplies(
  pending: PendingRestore | null | undefined,
  target: { chapter: string; sessionId?: string },
): boolean {
  if (!pending) return false;
  return pending.sessionId
    ? pending.sessionId === target.sessionId
    : !target.sessionId && pending.chapter === target.chapter;
}
