import { fetch as undiciFetch, Agent } from "undici";
import { parseGeneric } from "../lib/adapters/generic";

async function main() {
  const url =
    "https://amethystwriters.com/novel/return-of-the-mount-hua-sect/chapter-1125/";
  const dispatcher = new Agent({ allowH2: true });
  const res = await undiciFetch(url, {
    dispatcher,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
      accept: "text/html",
    },
  });
  const html = await res.text();
  const chapter = parseGeneric(html, url);
  console.log("title:", chapter.title);
  console.log("paragraphs:", chapter.paragraphs.length);
  console.log("nextUrl:", chapter.nextUrl);
  console.log("prevUrl:", chapter.prevUrl);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
