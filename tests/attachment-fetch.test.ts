import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { lookup, publicFetch } = vi.hoisted(() => ({ lookup: vi.fn(), publicFetch: vi.fn() }));

vi.mock('node:dns/promises', () => ({ lookup }));
// fetchPublicUrl goes through undici's own fetch; storage reads use the global one.
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: publicFetch,
}));
vi.mock('@/lib/storage', () => ({
  getStorageClient: () => ({ publicUrl: 'http://192.168.1.20:9000/zetora-uploads' }),
}));

import { fetchAttachment, isInstanceStorageUrl } from '@/lib/net/attachment-fetch';
import { readBodyCapped } from '@/lib/net/public-url';

const STORAGE = 'http://192.168.1.20:9000/zetora-uploads';

describe('isInstanceStorageUrl', () => {
  it('matches objects under the storage public URL', () => {
    expect(isInstanceStorageUrl(`${STORAGE}/zetora/users/u1/a.txt`, STORAGE)).toBe(true);
  });

  it('rejects another origin, a look-alike host or another bucket path', () => {
    expect(isInstanceStorageUrl('http://192.168.1.20:8080/zetora-uploads/a.txt', STORAGE)).toBe(false);
    expect(isInstanceStorageUrl('http://192.168.1.20:9000/zetora-uploads-evil/a.txt', STORAGE)).toBe(false);
    expect(isInstanceStorageUrl('http://192.168.1.20:9000/other/a.txt', STORAGE)).toBe(false);
    expect(isInstanceStorageUrl('not a url', STORAGE)).toBe(false);
  });
});

describe('fetchAttachment', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads from the instance storage even though it is on a private address', async () => {
    fetchMock.mockResolvedValue(new Response('hello', { headers: { 'content-type': 'text/plain' } }));
    const result = await fetchAttachment(`${STORAGE}/zetora/users/u1/a.txt`);
    expect(new TextDecoder().decode(result.bytes)).toBe('hello');
    expect(result.contentType).toBe('text/plain');
  });

  it('refuses an internal address that is not the storage', async () => {
    await expect(fetchAttachment('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('private address');
    await expect(fetchAttachment('http://redis:6379/')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it('refuses a public host that resolves to a private address', async () => {
    lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(fetchAttachment('https://rebind.example/x')).rejects.toThrow('private address');
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it('fetches a public URL through the guard', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    publicFetch.mockResolvedValue(new Response('public'));
    const result = await fetchAttachment('https://example.com/file.txt');
    expect(new TextDecoder().decode(result.bytes)).toBe('public');
  });

  it('fails on an error status', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404, statusText: 'Not Found' }));
    await expect(fetchAttachment(`${STORAGE}/zetora/users/u1/missing.txt`)).rejects.toThrow('404');
  });
});

describe('readBodyCapped', () => {
  it('refuses a declared length over the cap', async () => {
    const response = new Response('x'.repeat(10), { headers: { 'content-length': '10' } });
    await expect(readBodyCapped(response, 5)).rejects.toThrow('exceeds 5 bytes');
  });

  it('refuses a streamed body over the cap', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(4));
        controller.close();
      },
    });
    await expect(readBodyCapped(new Response(stream), 6)).rejects.toThrow('exceeds 6 bytes');
  });

  it('returns the whole body under the cap', async () => {
    const bytes = await readBodyCapped(new Response('abc'), 10);
    expect(new TextDecoder().decode(bytes)).toBe('abc');
  });
});
