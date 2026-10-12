import { serverEnv } from '@/env/server';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

import { getStorageClient } from '@/lib/storage';

import { createLogger } from '@/lib/logger';

const log = createLogger('clean-images');

export async function GET(req: NextRequest) {
  // Refuse to run with the default "placeholder" secret — otherwise a
  // missing env var would make this destructive endpoint publicly callable.
  const secret = serverEnv.CRON_SECRET;
  if (!secret || secret === 'placeholder') {
    return new NextResponse('Cron endpoint disabled: CRON_SECRET is not configured', { status: 503 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const deletedCount = await deleteAllObjectsWithPrefix('zetora/public');
    return new NextResponse(`Deleted ${deletedCount} public files with zetora/public prefix`, {
      status: 200,
    });
  } catch (error) {
    log.error('An error occurred:', error);
    return new NextResponse('An error occurred while deleting files', {
      status: 500,
    });
  }
}

async function deleteAllObjectsWithPrefix(prefix: string): Promise<number> {
  const { client: storageClient, bucketName: storageBucket } = getStorageClient();
  let continuationToken: string | undefined;
  let totalDeleted = 0;

  do {
    // List objects with prefix
    const listResponse = await storageClient.send(
      new ListObjectsV2Command({
        Bucket: storageBucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    const objects = listResponse.Contents;

    if (objects && objects.length > 0) {
      // Delete objects in batch
      await storageClient.send(
        new DeleteObjectsCommand({
          Bucket: storageBucket,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
            Quiet: true,
          },
        }),
      );

      totalDeleted += objects.length;
      log.debug(`Deleted ${objects.length} objects`);
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  log.debug(`All objects with prefix "${prefix}" were deleted. Total: ${totalDeleted}`);
  return totalDeleted;
}
