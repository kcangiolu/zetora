import { S3Client } from '@aws-sdk/client-s3';

type StorageProvider = 'cloudflare-r2' | 'minio';

function getStorageConfig() {
  const provider = (process.env.STORAGE_PROVIDER || 'cloudflare-r2') as StorageProvider;

  if (provider === 'minio') {
    return {
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      // Browser-facing presigned URLs must hit a host the browser can
      // actually reach (e.g. a reverse-proxied HTTPS domain) — inside
      // Docker, S3_ENDPOINT is the internal service name (http://minio:9000),
      // which is neither routable nor HTTPS from the client. Falls back to
      // S3_ENDPOINT so cloud/local-dev setups where the endpoint is already
      // public keep working unchanged.
      presignEndpoint: process.env.S3_PRESIGN_ENDPOINT || process.env.S3_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      bucketName: process.env.S3_BUCKET_NAME || 'zetora-uploads',
      publicUrl: process.env.S3_PUBLIC_URL || 'http://localhost:9000/zetora-uploads',
    };
  }

  // Cloudflare R2 (default) — the R2 API endpoint is already publicly
  // reachable, so presigning uses the same endpoint as internal operations.
  const r2Endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return {
    region: 'auto',
    endpoint: r2Endpoint,
    presignEndpoint: r2Endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: false,
    bucketName: process.env.R2_BUCKET_NAME!,
    publicUrl: process.env.R2_PUBLIC_URL!,
  };
}

const storageConfig = getStorageConfig();

export const storageClient = new S3Client({
  region: storageConfig.region,
  endpoint: storageConfig.endpoint,
  credentials: storageConfig.credentials,
  forcePathStyle: storageConfig.forcePathStyle,
});

// Used only to sign URLs handed to the browser (upload PUT). Kept separate
// from storageClient because the two can point at different hosts — see
// presignEndpoint above.
export const storagePresignClient = new S3Client({
  region: storageConfig.region,
  endpoint: storageConfig.presignEndpoint,
  credentials: storageConfig.credentials,
  forcePathStyle: storageConfig.forcePathStyle,
});

export const STORAGE_BUCKET_NAME = storageConfig.bucketName;
export const STORAGE_PUBLIC_URL = storageConfig.publicUrl;
