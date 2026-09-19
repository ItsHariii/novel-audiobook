import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    // IANA reserves 192.0.0.0/24, not all of 192.0.0.0/16.
    // WordPress-hosted chapter sites legitimately use public 192.0.78.x.
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    // Only global unicast; excludes loopback, mapped IPv4, link-local and ULA.
    return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address) && !/^2002:/i.test(address);
  }
  return false;
}

export async function publicUrl(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) {
    throw new Error("Only public HTTP(S) chapter URLs are supported");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) throw new Error("Private network URLs are not supported");
}
