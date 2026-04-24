import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";
import { pickAdapter } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Cloudflare-protected sources (e.g. skydemonorder.com) block undici's default
// HTTP/1.1 fingerprint with a 403. Enabling HTTP/2 via ALPN makes the request
// look enough like a real browser to pass through. This dispatcher is reused
// across requests so undici can keep the TLS/H2 session warm.
const h2Dispatcher = new Agent({ allowH2: true });

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url parameter" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ ok: false, error: "Only http(s) URLs are allowed" }, { status: 400 });
  }

  let html: string;
  try {
    const res = await undiciFetch(target.toString(), {
      dispatcher: h2Dispatcher,
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "upgrade-insecure-requests": "1",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Upstream returned ${res.status}` },
        { status: 502 },
      );
    }
    html = await res.text();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Fetch failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  try {
    const adapter = pickAdapter(target.toString());
    const chapter = adapter(html, target.toString());
    if (chapter.paragraphs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Could not find chapter content on the page" },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, chapter });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Parse failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
