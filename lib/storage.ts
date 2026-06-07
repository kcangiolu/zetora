import { S3Client } from '@aws-sdk/client-s3';

export type StorageProvider = 'cloudflare-r2' | 'minio';

function getStorageConfig() {
  const provider = (process.env.STORAGE_PROVIDER || 'cloudflare-r2') as StorageProvider;

  if (provider === 'minio') {
    return {
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      bucketName: process.env.S3_BUCKET_NAME || 'zetora-uploads',
      publicUrl: process.env.S3_PUBLIC_URL || 'http://localhost:9000/zetora-uploads',
    };
  }

  // Cloudflare R2 (default)
  return {
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
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

export const STORAGE_BUCKET_NAME = storageConfig.bucketName;
export const STORAGE_PUBLIC_URL = storageConfig.publicUrl;
