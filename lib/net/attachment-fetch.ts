import 'server-only';

import { fetchPublicUrl, readBodyCapped } from '@/lib/net/public-url';
import { getStorageClient } from '@/lib/storage';
import { ATTACHMENT_TIMEOUT_MS } from '@/lib/timeouts';

// The largest object the upload route accepts.
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const ATTACHMENT_REDIRECTS = 3;

// Whether a URL points into this instance's own storage (S3_PUBLIC_URL),
// compared as an origin plus path prefix, never as a string prefix.
export function isInstanceStorageUrl(raw: string, storagePublicUrl: string): boolean {
  let url: URL;
  let base: URL;
  try {
    url = new URL(raw);
    base = new URL(storagePublicUrl);
  } catch {
    return false;
  }
  if (url.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/+$/, '');
  return url.pathname.startsWith(`${basePath}/`);
}

// Attachment URLs come from the client's message history, so they get the
// same SSRF guard as any user-supplied URL. The instance's own storage is the
// exception: it may sit on a private address, and its objects are public.
export async function fetchAttachment(
  raw: string,
  { maxBytes = MAX_ATTACHMENT_BYTES }: { maxBytes?: number } = {},
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | undefined }> {
  const response = isInstanceStorageUrl(raw, getStorageClient().publicUrl)
    ? await fetch(raw, { signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS) })
    : (await fetchPublicUrl(raw, { timeoutMs: ATTACHMENT_TIMEOUT_MS, maxRedirects: ATTACHMENT_REDIRECTS })).response;

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Failed to fetch attachment: ${response.status} ${response.statusText}`);
  }
  const bytes = await readBodyCapped(response, maxBytes);
  return { bytes, contentType: response.headers.get('content-type') ?? undefined };
}
