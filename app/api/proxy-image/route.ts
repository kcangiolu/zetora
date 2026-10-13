import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { fetchPublicUrl, PublicUrlError } from '@/lib/net/public-url';

const log = createLogger('proxy-image');

// This endpoint is reachable without auth (favicons/thumbnails on public
// share pages), so it must not be usable as an SSRF gateway or open proxy:
// http(s) only, no private/reserved IPs (checked on every redirect hop),
// image content types only, capped size, short timeout.

const MAX_REDIRECTS = 3;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 10_000;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    let response: Response;
    try {
      ({ response } = await fetchPublicUrl(raw, {
        timeoutMs: FETCH_TIMEOUT_MS,
        maxRedirects: MAX_REDIRECTS,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      }));
    } catch (e) {
      if (e instanceof PublicUrlError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
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
    log.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 });
  }
}
