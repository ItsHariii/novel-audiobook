export interface Chapter {
  url: string;
  title: string;
  paragraphs: string[];
  nextUrl: string | null;
  prevUrl: string | null;
  source: string;
  // Book / novel name (e.g. "Return of the Mount Hua Sect"). Often equals
  // `title` for sites that put the book name in the heading. Used to group
  // chapters in the library.
  bookTitle?: string;
  // Chapter-specific label (e.g. "Chapter 1125 - This Place, This Is Hell.")
  // when distinct from the book title. Display under the book title in the
  // player.
  chapterLabel?: string;
}

export interface ChapterResponse {
  ok: true;
  chapter: Chapter;
}

export interface ChapterError {
  ok: false;
  error: string;
}
