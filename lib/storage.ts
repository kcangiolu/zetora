import { S3Client } from '@aws-sdk/client-s3';

// File storage: any S3-compatible service (MinIO/Silo, Cloudflare R2, AWS S3,
// Backblaze B2...), configured entirely by the S3_* variables. Nothing is
// assumed: a missing variable fails the storage call that needed it.

export interface StorageClients {
  client: S3Client;
  presignClient: S3Client;
  bucketName: string;
  publicUrl: string;
}

const REQUIRED_VARIABLES = [
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
  'S3_PUBLIC_URL',
  'S3_REGION',
] as const;

// Storage asked for while the S3_* variables are missing. Its message names
// them and is meant for the user as is.
export class StorageNotConfiguredError extends Error {
  override name = 'StorageNotConfiguredError';
}

let clients: StorageClients | null = null;

export function getStorageClient(): StorageClients {
  if (clients) return clients;

  const missing = REQUIRED_VARIABLES.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new StorageNotConfiguredError(`File storage is not configured: set ${missing.join(', ')} (see .env.example)`);
  }

  const credentials = {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  };
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

  clients = {
    client: new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      credentials,
      forcePathStyle,
    }),
    // Signs the URLs handed to the browser (upload PUT), which must reach a
    // host the browser can: S3_ENDPOINT may be an internal Docker address
    // (http://minio:9000), so S3_PRESIGN_ENDPOINT can point at the public one.
    presignClient: new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_PRESIGN_ENDPOINT || process.env.S3_ENDPOINT,
      credentials,
      forcePathStyle,
    }),
    bucketName: process.env.S3_BUCKET_NAME!,
    publicUrl: process.env.S3_PUBLIC_URL!,
  };
  return clients;
}
