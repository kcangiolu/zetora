import { S3Client } from '@aws-sdk/client-s3';
import { serverEnv } from '@/env/server';

export type StorageProvider = 'cloudflare-r2' | 'minio';

export interface StorageClients {
  client: S3Client;
  presignClient: S3Client;
  bucketName: string;
  publicUrl: string;
}

function buildStorageConfig(provider: StorageProvider) {
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

// Keyed by resolved provider (not "first call wins") so a mixed deployment —
// some users on MinIO, some on R2 via the zetora-storage-provider preference
// — gets a correct, live client for each, not whichever provider happened
// to initialize first. S3Client construction is cheap; this cache just
// avoids re-building one per request for the common case of everyone using
// the same provider.
const clientCache = new Map<StorageProvider, StorageClients>();

export function getStorageClient(preferredProvider?: StorageProvider): StorageClients {
  const provider = preferredProvider ?? (serverEnv.STORAGE_PROVIDER as StorageProvider);

  const cached = clientCache.get(provider);
  if (cached) return cached;

  const config = buildStorageConfig(provider);

  const clients: StorageClients = {
    client: new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.credentials,
      forcePathStyle: config.forcePathStyle,
    }),
    // Used only to sign URLs handed to the browser (upload PUT). Kept
    // separate from `client` because the two can point at different hosts
    // — see presignEndpoint above.
    presignClient: new S3Client({
      region: config.region,
      endpoint: config.presignEndpoint,
      credentials: config.credentials,
      forcePathStyle: config.forcePathStyle,
    }),
    bucketName: config.bucketName,
    publicUrl: config.publicUrl,
  };

  clientCache.set(provider, clients);
  return clients;
}
