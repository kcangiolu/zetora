import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { storageClient, STORAGE_BUCKET_NAME } from '@/lib/storage';
import { getGeneratedFilesByUserId, deleteGeneratedFileById } from '@/lib/db/queries';

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
    console.warn('Error checking authentication:', error);
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
    { headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=60' } },
  );
}

export async function DELETE(request: NextRequest) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    console.warn('Error checking authentication:', error);
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
    const deleted = await deleteGeneratedFileById({ id: validated.data.id, userId: session.user.id });
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await storageClient.send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET_NAME, Key: deleted.key })).catch((e) => {
      // The DB row is already gone — log and move on rather than leaving the
      // user stuck if the bucket object was already removed out-of-band.
      console.error('Failed to delete generated file object from storage:', e);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting generated file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
