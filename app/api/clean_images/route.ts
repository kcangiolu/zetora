import { serverEnv } from '@/env/server';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

import { storageClient, STORAGE_BUCKET_NAME } from '@/lib/storage';

export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const deletedCount = await deleteAllObjectsWithPrefix('zetora/public');
    return new NextResponse(`Deleted ${deletedCount} public files with zetora/public prefix`, {
      status: 200,
    });
  } catch (error) {
    console.error('An error occurred:', error);
    return new NextResponse('An error occurred while deleting files', {
      status: 500,
    });
  }
}

async function deleteAllObjectsWithPrefix(prefix: string): Promise<number> {
  let continuationToken: string | undefined;
  let totalDeleted = 0;

  do {
    // List objects with prefix
    const listResponse = await storageClient.send(
      new ListObjectsV2Command({
        Bucket: STORAGE_BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listResponse.Contents;

    if (objects && objects.length > 0) {
      // Delete objects in batch
      await storageClient.send(
        new DeleteObjectsCommand({
          Bucket: STORAGE_BUCKET_NAME,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
            Quiet: true,
          },
        })
      );

      totalDeleted += objects.length;
      console.log(`Deleted ${objects.length} objects`);
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  console.log(`All objects with prefix "${prefix}" were deleted. Total: ${totalDeleted}`);
  return totalDeleted;
}
