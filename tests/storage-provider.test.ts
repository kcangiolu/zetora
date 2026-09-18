import { describe, it, expect, beforeEach } from 'vitest';

// Same env vars in every test on purpose: getStorageClient() caches per
// resolved provider for the lifetime of the module, so these tests reuse
// that shared cache across each other rather than fighting it — as long as
// the env values never change between tests, that's safe.
beforeEach(() => {
  process.env.S3_BUCKET_NAME = 'test-minio-bucket';
  process.env.S3_PUBLIC_URL = 'http://localhost:9000/test-minio-bucket';
  process.env.S3_ENDPOINT = 'http://minio:9000';
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_BUCKET_NAME = 'test-r2-bucket';
  process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
});

describe('getStorageClient', () => {
  it('resolves MinIO config when preferredProvider is minio', async () => {
    const { getStorageClient } = await import('@/lib/storage');
    const { bucketName, publicUrl } = getStorageClient('minio');
    expect(bucketName).toBe('test-minio-bucket');
    expect(publicUrl).toBe('http://localhost:9000/test-minio-bucket');
  });

  it('resolves Cloudflare R2 config when preferredProvider is cloudflare-r2', async () => {
    const { getStorageClient } = await import('@/lib/storage');
    const { bucketName, publicUrl } = getStorageClient('cloudflare-r2');
    expect(bucketName).toBe('test-r2-bucket');
    expect(publicUrl).toBe('https://cdn.example.com');
  });

  it('caches per resolved provider, so two providers can coexist in the same process', async () => {
    const { getStorageClient } = await import('@/lib/storage');
    const minioA = getStorageClient('minio');
    const minioB = getStorageClient('minio');
    const r2 = getStorageClient('cloudflare-r2');

    expect(minioA).toBe(minioB);
    expect(minioA).not.toBe(r2);
    expect(minioA.bucketName).not.toBe(r2.bucketName);
  });
});
