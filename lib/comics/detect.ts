/** Hosts whose chapter links are always comics. */
export const COMIC_HOSTS = ["asurascans.com", "asuracomic.net"];

const COMIC_PATH_RE = /^(comics?|manga|manhwa|manhua|webtoons?|series-comic)$/i;

function host(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

/** Best guess, from the link alone, that it points at a comic chapter rather than a novel. */
export function looksLikeComic(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  const h = host(url);
  if (COMIC_HOSTS.some((c) => h === c || h.endsWith(`.${c}`))) return true;
  if (/(^|\.)(manga|manhwa|manhua|webtoon|comic|scans?)[a-z0-9-]*\./i.test(h)) return true;
  return url.pathname.split("/").filter(Boolean).some((seg) => COMIC_PATH_RE.test(seg));
}
