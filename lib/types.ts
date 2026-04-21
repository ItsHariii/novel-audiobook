export interface Chapter {
  url: string;
  title: string;
  paragraphs: string[];
  nextUrl: string | null;
  prevUrl: string | null;
  source: string;
}

export interface ChapterResponse {
  ok: true;
  chapter: Chapter;
}

export interface ChapterError {
  ok: false;
  error: string;
}
