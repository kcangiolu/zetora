import 'server-only';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { storageClient, STORAGE_BUCKET_NAME, STORAGE_PUBLIC_URL } from '@/lib/storage';
import { insertGeneratedFile } from '@/lib/db/queries';

import { createLogger } from '@/lib/logger';

const log = createLogger('generated-file-storage');

export interface PersistGeneratedFileParams {
  userId: string;
  chatId?: string | null;
  buffer: Buffer;
  filename: string;
  mediaType: string;
  kind: 'image' | 'document';
  toolName: string;
}

// Uploads a tool-produced file to our own bucket (same one /api/upload uses)
// under the user's prefix, and records it in `generated_file` so it shows up
// in Settings → Downloads. Used for anything an AI tool produces — generated
// images, generated documents, code-interpreter charts — as opposed to files
// the user uploaded themselves (tracked separately, see app/api/upload).
export async function persistGeneratedFile({
  userId,
  chatId,
  buffer,
  filename,
  mediaType,
  kind,
  toolName,
}: PersistGeneratedFileParams): Promise<{ url: string; key: string }> {
  const key = `zetora/users/${userId}/generated/${nanoid()}-${filename}`;

  await storageClient.send(
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mediaType,
    }),
  );

  const url = `${STORAGE_PUBLIC_URL}/${key}`;

  await insertGeneratedFile({
    userId,
    chatId,
    key,
    url,
    filename,
    mediaType,
    kind,
    toolName,
    sizeBytes: buffer.length,
  });

  return { url, key };
}

function extensionFromContentType(contentType: string): string {
  const subtype = contentType.split('/')[1]?.split('+')[0]?.split(';')[0];
  return subtype || 'png';
}

// Downloads (or decodes, for a data: URI) an image returned by an external
// provider and re-uploads it to our own storage, so the chat message no
// longer depends on that provider's URL still being valid later (e.g. a
// ComfyUI wrapper's short-lived signed URLs). Falls back to the original
// URL on any failure so a storage hiccup never breaks image generation.
export async function rehostGeneratedImage({
  userId,
  chatId,
  sourceImageUrl,
  filenameHint,
  toolName,
}: {
  userId?: string;
  chatId?: string | null;
  sourceImageUrl: string;
  filenameHint: string;
  toolName: string;
}): Promise<string> {
  if (!userId) return sourceImageUrl;

  try {
    let buffer: Buffer;
    let contentType = 'image/png';

    if (sourceImageUrl.startsWith('data:')) {
      const match = sourceImageUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
      if (!match) return sourceImageUrl;
      contentType = match[1] || 'image/png';
      buffer = Buffer.from(match[2], 'base64');
    } else {
      const response = await fetch(sourceImageUrl, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) return sourceImageUrl;
      contentType = response.headers.get('content-type') || 'image/png';
      buffer = Buffer.from(await response.arrayBuffer());
    }

    const filename = `${filenameHint}.${extensionFromContentType(contentType)}`;
    const { url } = await persistGeneratedFile({
      userId,
      chatId,
      buffer,
      filename,
      mediaType: contentType,
      kind: 'image',
      toolName,
    });
    return url;
  } catch (error) {
    log.error(`[${toolName}] Failed to re-host image, falling back to provider URL:`, error);
    return sourceImageUrl;
  }
}
