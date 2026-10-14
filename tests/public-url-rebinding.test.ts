import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// The up-front check sees a public answer; the connection's own lookup then
// resolves the real host to 127.0.0.1, as a rebinding DNS server would.
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));

import { fetchPublicUrl } from '@/lib/net/public-url';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((_req, res) => res.end('internal'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe('fetchPublicUrl', () => {
  it('refuses to connect when the host resolves to a private address at connect time', async () => {
    const error = await fetchPublicUrl(`http://localhost:${port}/`, { timeoutMs: 5_000, maxRedirects: 0 }).catch(
      (e: unknown) => e,
    );
    // undici reports connect failures as "fetch failed" with the lookup error as cause.
    expect((error as Error & { cause?: Error }).cause?.message).toBe('Target resolves to a private address');
  });

  it('reaches the same server through plain fetch, so the refusal comes from the guard', async () => {
    const response = await fetch(`http://localhost:${port}/`);
    expect(await response.text()).toBe('internal');
  });
});
