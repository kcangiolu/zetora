import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { getStorageClient } from '@/lib/storage';

import { getGeneratedFilesByUserId, deleteGeneratedFileById } from '@/lib/db/queries';

import { createLogger } from '@/lib/logger';

const log = createLogger('downloads');

// Safe integer parsing with bounds — mirrors app/api/upload/route.ts
function parseLimit(raw: string | null, defaultVal: number, max: number): number {
  const n = parseInt(raw ?? String(defaultVal), 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

const DeleteRequestSchema = z.object({
  id: z.string().min(1),
});

export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    log.warn('Error checking authentication:', error);
  }

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = parseLimit(searchParams.get('limit'), 50, 200);

  const { files, nextCursor } = await getGeneratedFilesByUserId({ userId: session.user.id, limit, cursor });

  return NextResponse.json(
    {
      files: files.map((f) => ({
        id: f.id,
        key: f.key,
        url: f.url,
        filename: f.filename,
        mediaType: f.mediaType,
        kind: f.kind,
        toolName: f.toolName,
        sizeBytes: f.sizeBytes,
        chatId: f.chatId,
        createdAt: f.createdAt.toISOString(),
      })),
      nextCursor,
    },
    // The list changes on every upload and delete; a cached copy would show
    // deleted files again.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function DELETE(request: NextRequest) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    log.warn('Error checking authentication:', error);
  }

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = DeleteRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Ownership-checked by userId in the WHERE clause, not just the id.
    const { client: storageClient, bucketName: storageBucket } = getStorageClient();
    const deleted = await deleteGeneratedFileById({
      id: validated.data.id,
      userId: session.user.id,
      removeObject: (key) => storageClient.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: key })),
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error deleting generated file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
