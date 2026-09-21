import { Agent, fetch as undiciFetch } from "undici";
import { lookup } from "node:dns";
import { publicAddress, publicUrl } from "@/lib/hls/public-url";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const HTML_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";

// Cloudflare-protected sources reject undici's default HTTP/1.1 fingerprint;
// ALPN h2 gets through. Resolution is re-checked at connect time so a DNS
// answer that changes after `publicUrl` cannot reach a private address.
const publicDispatcher = new Agent({ allowH2: true, connect: {
  lookup(hostname, options, callback) {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, []);
      if (addresses.some((a) => !publicAddress(a.address))) return callback(new Error("Private network address blocked"), []);
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  },
} });

export type SafeResponse = Awaited<ReturnType<typeof undiciFetch>>;

/**
 * GET a public http(s) URL. Private and loopback targets are refused, both up
 * front and on every redirect hop.
 */
export async function safeFetch(url: URL, options: { accept?: string; timeoutMs?: number; referer?: string } = {}, redirects = 0): Promise<SafeResponse> {
  await publicUrl(url);
  const res = await undiciFetch(url.toString(), {
    redirect: "manual",
    dispatcher: publicDispatcher,
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    headers: {
      "user-agent": USER_AGENT,
      accept: options.accept ?? HTML_ACCEPT,
      "accept-language": "en-US,en;q=0.9",
      ...(options.referer ? { referer: options.referer } : {}),
    },
  });
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get("location");
    await res.body?.cancel();
    if (!location || redirects >= 4) throw new Error("Invalid upstream redirect");
    return safeFetch(new URL(location, url), options, redirects + 1);
  }
  return res;
}
