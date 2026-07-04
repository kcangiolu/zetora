import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// This endpoint is reachable without auth (favicons/thumbnails on public
// share pages), so it must not be usable as an SSRF gateway or open proxy:
// http(s) only, no private/reserved IPs (checked on every redirect hop),
// image content types only, capped size, short timeout.

const MAX_REDIRECTS = 3;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 10_000;

function isPrivateIp(ip: string): boolean {
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

async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Target resolves to a private address');
    return url;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error('Target resolves to a private address');
  }
  return url;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    let current: URL;
    try {
      current = await assertPublicHttpUrl(raw);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid URL' }, { status: 400 });
    }

    // Follow redirects manually so every hop gets the same private-IP check.
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) {
          return NextResponse.json({ error: 'Too many redirects' }, { status: 400 });
        }
        try {
          current = await assertPublicHttpUrl(new URL(location, current).toString());
        } catch {
          return NextResponse.json({ error: 'Redirect target not allowed' }, { status: 400 });
        }
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response?.status ?? 502 });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Target is not an image' }, { status: 415 });
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    // Cap the streamed size even when Content-Length is absent or lies.
    let transferred = 0;
    const limiter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        transferred += chunk.byteLength;
        if (transferred > MAX_BYTES) {
          controller.error(new Error('Image too large'));
          return;
        }
        controller.enqueue(chunk);
      },
    });

    return new NextResponse(response.body?.pipeThrough(limiter) ?? null, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 });
  }
}
