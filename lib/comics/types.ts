export interface ComicPage {
  url: string;
  width?: number;
  height?: number;
}

export interface ComicChapterRef {
  url: string;
  label: string;
  number?: number;
}

export interface ComicChapter {
  kind: "comic";
  url: string;
  /** Stable series identity; every chapter of one series shares it. */
  bookId: string;
  bookTitle: string;
  chapterLabel: string;
  chapterNumber?: number;
  pages: ComicPage[];
  nextUrl: string | null;
  prevUrl: string | null;
  source: string;
  coverUrl?: string;
  /** Every chapter of the series, when the source lists them. Newest first as the site gives them. */
  chapters?: ComicChapterRef[];
}
