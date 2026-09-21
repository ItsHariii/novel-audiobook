import { NextRequest, NextResponse } from "next/server";
import { safeFetch } from "@/lib/http/safeFetch";
import { verifyCoverUrl } from "@/lib/covers/extract";
import { coverSecret } from "@/lib/covers/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = /^image\/(jpeg|png|webp|avif|gif)$/;

function fail(status: number) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Streams a cover image found by /api/cover. Only URLs carrying our signature
 * are fetched, so this is not an open proxy; `<img>` can load it without auth.
 */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src");
  const sig = req.nextUrl.searchParams.get("sig");
  const secret = coverSecret();
  if (!src || !sig || !verifyCoverUrl(src, sig, secret)) return fail(403);
  let target: URL;
  try { target = new URL(src); } catch { return fail(400); }
  try {
    const res = await safeFetch(target, { accept: "image/avif,image/webp,image/*;q=0.8", timeoutMs: 8000, referer: `${target.origin}/` });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const length = Number(res.headers.get("content-length") || 0);
    if (!res.ok || !TYPES.test(type) || length > MAX_BYTES || !res.body) {
      await res.body?.cancel();
      return fail(502);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) return fail(502);
      chunks.push(chunk);
    }
    return new NextResponse(Buffer.concat(chunks), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return fail(502);
  }
}
