import 'server-only';

import { GetObjectCommand } from '@aws-sdk/client-s3';

import { fetchPublicUrl, readBodyCapped } from '@/lib/net/public-url';
import { getStorageClient, type StorageClients } from '@/lib/storage';
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

// The instance's own files are read through S3_ENDPOINT, not their public
// URL: that URL is the browser's way in, which this server may not reach
// (localhost seen from inside a container, a proxy that filters by country).
async function readStorageObject(
  raw: string,
  storage: StorageClients,
  maxBytes: number,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | undefined }> {
  const basePath = new URL(storage.publicUrl).pathname.replace(/\/+$/, '');
  const key = decodeURIComponent(new URL(raw).pathname.slice(basePath.length + 1));
  let object;
  try {
    object = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucketName, Key: key }), {
      abortSignal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Failed to fetch attachment: ${error instanceof Error ? error.name : String(error)}`);
  }
  if (!object.Body) throw new Error('Failed to fetch attachment: empty object');
  const headers = object.ContentLength === undefined ? undefined : { 'content-length': String(object.ContentLength) };
  const bytes = await readBodyCapped(new Response(object.Body.transformToWebStream(), { headers }), maxBytes);
  return { bytes, contentType: object.ContentType };
}

// Attachment URLs come from the client's message history, so they get the
// same SSRF guard as any user-supplied URL. The instance's own storage is the
// exception: it may sit on a private address, and is read as a bucket.
export async function fetchAttachment(
  raw: string,
  { maxBytes = MAX_ATTACHMENT_BYTES }: { maxBytes?: number } = {},
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | undefined }> {
  const storage = getStorageClient();
  if (isInstanceStorageUrl(raw, storage.publicUrl)) return readStorageObject(raw, storage, maxBytes);

  const { response } = await fetchPublicUrl(raw, {
    timeoutMs: ATTACHMENT_TIMEOUT_MS,
    maxRedirects: ATTACHMENT_REDIRECTS,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Failed to fetch attachment: ${response.status} ${response.statusText}`);
  }
  const bytes = await readBodyCapped(response, maxBytes);
  return { bytes, contentType: response.headers.get('content-type') ?? undefined };
}
