import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { getStorageClient } from '@/lib/storage';
import { insertUploadedFile } from '@/lib/db/queries';

import { createLogger } from '@/lib/logger';


const log = createLogger('upload-confirm');

const ConfirmRequestSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1).max(255),
});

// Second step of an upload: POST /api/upload hands out a presigned URL, the
// browser PUTs the bytes straight to storage, then calls this so the file is
// recorded in uploaded_file. Only a key in the exact shape POST /api/upload
// generates for this user is accepted (which also rules out the generated/
// subfolder of Settings → Downloads), and the object must really exist —
// its size and type are read back from storage, not trusted from the client.
export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    log.warn('Error checking authentication:', error);
  }

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const validated = ConfirmRequestSchema.safeParse(await request.json());
    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { key, filename } = validated.data;
    const ownKeyPattern = new RegExp(`^zetora/users/${escapeRegExp(userId)}/[A-Za-z0-9_-]+\\.[a-z0-9]{1,10}$`);
    if (!ownKeyPattern.test(key)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { client: storageClient, bucketName: storageBucket, publicUrl: storagePublicUrl } = getStorageClient();
    const head = await storageClient
      .send(new HeadObjectCommand({ Bucket: storageBucket, Key: key }))
      .catch(() => null);
    if (!head) {
      return NextResponse.json({ error: 'Uploaded file not found' }, { status: 404 });
    }

    const row = await insertUploadedFile({
      userId,
      key,
      url: `${storagePublicUrl}/${key}`,
      filename,
      mediaType: head.ContentType ?? null,
      sizeBytes: head.ContentLength ?? null,
    });
    if (!row) {
      return NextResponse.json({ error: 'Failed to record upload' }, { status: 500 });
    }

    return NextResponse.json({ url: row.url, filename: row.filename, mediaType: row.mediaType });
  } catch (error) {
    log.error('Error confirming upload:', error);
    return NextResponse.json({ error: 'Failed to record upload' }, { status: 500 });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
