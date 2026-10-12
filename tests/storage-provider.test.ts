import { afterEach, describe, it, expect, vi } from 'vitest';

const S3_ENV = {
  S3_ENDPOINT: 'http://minio:9000',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET_NAME: 'test-bucket',
  S3_PUBLIC_URL: 'https://files.example.com/test-bucket',
  S3_REGION: 'us-east-1',
};

// getStorageClient() caches its clients for the life of the module.
async function loadStorage(env: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import('@/lib/storage');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getStorageClient', () => {
  it('builds the clients from the S3_* variables', async () => {
    const { getStorageClient } = await loadStorage(S3_ENV);
    const { bucketName, publicUrl } = getStorageClient();
    expect(bucketName).toBe('test-bucket');
    expect(publicUrl).toBe('https://files.example.com/test-bucket');
  });

  it('names every missing variable instead of assuming a default', async () => {
    const { getStorageClient } = await loadStorage({ ...S3_ENV, S3_ENDPOINT: '', S3_REGION: '' });
    expect(() => getStorageClient()).toThrow('File storage is not configured: set S3_ENDPOINT, S3_REGION');
  });
});
