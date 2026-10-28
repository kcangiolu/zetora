import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadFileToStorage } from '@/lib/upload-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadFileToStorage', () => {
  const file = new File(['x'], 'notes.txt', { type: 'text/plain' });

  it("shows the server's reason when no upload URL is handed out", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'File storage is not configured: set S3_ENDPOINT (see .env.example)' }, { status: 503 }),
      ),
    );
    await expect(uploadFileToStorage(file)).rejects.toThrow(
      'Failed to get upload URL: File storage is not configured: set S3_ENDPOINT (see .env.example)',
    );
  });

  it('falls back to the status when the response carries no reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad gateway', { status: 502 })),
    );
    await expect(uploadFileToStorage(file)).rejects.toThrow('Failed to get upload URL: HTTP 502');
  });
});
