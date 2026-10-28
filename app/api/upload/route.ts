import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import { auth } from '@/lib/auth';
import { getStorageClient, StorageNotConfiguredError } from '@/lib/storage';

import { getUploadedFilesByUserId, deleteUploadedFileByUrl, decodeUploadedFilesCursor } from '@/lib/db/queries';

import { createLogger } from '@/lib/logger';

const log = createLogger('upload');

// Image types (5MB limit) — webp/heic/heif cover iOS Photos picker output
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];

// Document types (50MB limit)
const DOCUMENT_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

const VALID_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES];

// File size limits
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB for documents

function isImageType(contentType: string): boolean {
  return IMAGE_TYPES.includes(contentType);
}

// Generic text-readable files: any extension is accepted, since browsers
// report an empty/octet-stream contentType for extensions they don't
// recognize (.log, .py, .yml, ...). Whether the bytes actually decode as
// text is checked server-side when the file is read (see app/api/search's
// text-file inlining/file_query_search routing), not here.
function isTextLikeType(contentType: string): boolean {
  return (
    contentType.startsWith('text/') ||
    contentType === 'application/json' ||
    contentType === 'application/xml' ||
    contentType === 'application/octet-stream' ||
    contentType === ''
  );
}

// The bucket serves objects publicly with their stored type, so text a
// browser would run (HTML, XML, scripts) is stored as plain text. Files keep
// their original type in the chat; only how storage serves them changes.
const SERVED_AS_IS_TEXT_TYPES = ['text/plain', 'text/csv', 'text/markdown', 'application/json'];

function storedContentType(contentType: string): string {
  if (!isTextLikeType(contentType) || contentType === '' || contentType === 'application/octet-stream') {
    return contentType;
  }
  return SERVED_AS_IS_TEXT_TYPES.includes(contentType) ? contentType : 'text/plain';
}

function isValidUploadType(contentType: string): boolean {
  return VALID_TYPES.includes(contentType) || isTextLikeType(contentType);
}

function getMaxSizeForType(contentType: string): number {
  return isImageType(contentType) ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
}

// Request validation schema for getting presigned URL
const UploadRequestSchema = z
  .object({
    filename: z.string().min(1),
    contentType: z.string().refine((type) => isValidUploadType(type), {
      message: 'Unsupported file type',
    }),
    size: z.number().int().nonnegative(),
  })
  .superRefine((data, ctx) => {
    const maxSize = getMaxSizeForType(data.contentType);
    if (data.size > maxSize) {
      const maxMB = maxSize / (1024 * 1024);
      const fileType = isImageType(data.contentType) ? 'Image' : 'Document';
      ctx.addIssue({
        code: 'custom',
        message: `${fileType} size should be less than ${maxMB}MB`,
        path: ['size'],
      });
    }
  });

// Delete request validation
const DeleteRequestSchema = z.object({
  url: z.string().url(),
});

// Only allow alphanumeric + a few safe chars as file extension to prevent key injection
function sanitizeExtension(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 10);
  return cleaned || 'bin';
}

// Safe integer parsing with bounds
function parseLimit(raw: string | null, defaultVal: number, max: number): number {
  const n = parseInt(raw ?? String(defaultVal), 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

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
  const rawCursor = searchParams.get('cursor');
  const cursor = rawCursor ? decodeUploadedFilesCursor(rawCursor) : undefined;
  if (cursor === null) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
  }
  const limit = parseLimit(searchParams.get('limit'), 50, 200);

  const { files, nextCursor } = await getUploadedFilesByUserId({ userId: session.user.id, limit, cursor });

  return NextResponse.json(
    {
      files: files.map((f) => ({
        id: f.id,
        key: f.key,
        url: f.url,
        filename: f.filename,
        mediaType: f.mediaType,
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

export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: request.headers,
    });
  } catch (error) {
    log.warn('Error checking authentication:', error);
  }

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = UploadRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json({ error: validated.error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }

    const { filename, contentType, size } = validated.data;
    const uploadContentType = storedContentType(contentType);

    // Sanitize extension to prevent path injection in the R2 key
    const rawExt = filename.split('.').pop() ?? '';
    const ext = sanitizeExtension(rawExt);

    const key = `zetora/users/${session.user.id}/${nanoid()}.${ext}`;

    const {
      presignClient: storagePresignClient,
      bucketName: storageBucket,
      publicUrl: storagePublicUrl,
    } = getStorageClient();
    const command = new PutObjectCommand({
      Bucket: storageBucket,
      Key: key,
      // Content-Type and Content-Length are part of the signature: the
      // browser's PUT (uploadFileToStorage in lib/upload-client.ts) must send
      // exactly these, so the declared size is the size that gets stored.
      ContentType: uploadContentType,
      ContentLength: size,
      // Store owner so individual files can be attributed even if the key format changes
      Metadata: { 'user-id': session.user.id },
    });

    const presignedUrl = await getSignedUrl(storagePresignClient, command, {
      expiresIn: 3600, // 1 hour
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    // Construct the final public URL
    const publicUrl = `${storagePublicUrl}/${key}`;

    return NextResponse.json({
      presignedUrl,
      contentType: uploadContentType,
      url: publicUrl,
      key,
      authenticated: true,
    });
  } catch (error) {
    log.error('Error generating presigned URL:', error);
    if (error instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
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
      return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
    }

    // Ownership-checked by userId in the WHERE clause, not just the URL.
    const { client: storageClient, bucketName: storageBucket } = getStorageClient();
    const deleted = await deleteUploadedFileByUrl({
      url: validated.data.url,
      userId: session.user.id,
      removeObject: (key) => storageClient.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: key })),
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
