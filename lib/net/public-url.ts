import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Shared SSRF guard for every server-side fetch of a user- or model-supplied
// URL: without it, the URL could point at an internal service or the cloud
// metadata endpoint and the response would come back through Zetora.

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    // IPv6 (including IPv4-mapped addresses)
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  );
}

// Rejected by the guard: the message is safe to show the caller.
export class PublicUrlError extends Error {}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicUrlError('Only http(s) URLs are allowed');
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new PublicUrlError('Target resolves to a private address');
    return url;
  }
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new PublicUrlError('Target resolves to a private address');
  }
  return url;
}

// Fetches a public http(s) URL, following redirects by hand so every hop gets
// the same private-address check. Returns the final response and its URL.
export async function fetchPublicUrl(
  raw: string,
  { headers, timeoutMs, maxRedirects }: { headers?: HeadersInit; timeoutMs: number; maxRedirects: number },
): Promise<{ response: Response; url: URL }> {
  let current = await assertPublicHttpUrl(raw);
  for (let hop = 0; ; hop++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers });
    if (response.status < 300 || response.status >= 400) return { response, url: current };

    const location = response.headers.get('location');
    if (!location || hop === maxRedirects) throw new PublicUrlError('Too many redirects');
    try {
      current = await assertPublicHttpUrl(new URL(location, current).toString());
    } catch {
      throw new PublicUrlError('Redirect target not allowed');
    }
  }
}
