import 'server-only';

import { lookup } from 'node:dns/promises';
import { lookup as lookupCallback } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

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

// Resolves like dns.lookup, but fails when any address is private. Used as
// the connection's own lookup, so the address checked is the one connected
// to: a DNS answer that changes between a check and the fetch cannot slip
// an internal address in.
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookupCallback(hostname, { all: true, verbatim: true, family: options.family }, (error, addresses) => {
    if (error) return callback(error, []);
    if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
      return callback(new PublicUrlError('Target resolves to a private address'), []);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

const publicAgent = new Agent({ connect: { lookup: publicOnlyLookup } });

// fetch() whose connections can only reach public addresses. The lookup
// does not run for IP-literal hosts, so check the URL with
// assertPublicHttpUrl first and never let redirects be followed blindly:
// pass redirect 'manual' or 'error'.
export const publicOnlyFetch: typeof fetch = (input, init) =>
  // undici's Request and Response are the global classes, typed apart.
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as UndiciRequestInit),
    dispatcher: publicAgent,
  }) as unknown as Promise<Response>;

// Drop-in fetch for a client that takes one (AI SDK providers): checks the URL
// like assertPublicHttpUrl, keeps the connection on public addresses and
// refuses redirects.
export const guardedPublicFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  await assertPublicHttpUrl(url);
  return publicOnlyFetch(input, { ...init, redirect: 'error' });
};

// Fetches a public http(s) URL, following redirects by hand so every hop gets
// the same private-address check. Returns the final response and its URL.
export async function fetchPublicUrl(
  raw: string,
  {
    headers,
    timeoutMs,
    maxRedirects,
    method,
    body,
  }: {
    headers?: HeadersInit;
    timeoutMs: number;
    maxRedirects: number;
    method?: string;
    body?: BodyInit;
  },
): Promise<{ response: Response; url: URL }> {
  let current = await assertPublicHttpUrl(raw);
  for (let hop = 0; ; hop++) {
    const response = await publicOnlyFetch(current, {
      method,
      body,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
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

// Reads a response body, refusing to buffer more than maxBytes: a declared
// Content-Length is checked up front, the stream as it arrives.
export async function readBodyCapped(response: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new PublicUrlError(`Response exceeds ${maxBytes} bytes`);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PublicUrlError(`Response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
