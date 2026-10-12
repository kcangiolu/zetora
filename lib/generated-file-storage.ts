import 'server-only';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { getStorageClient } from '@/lib/storage';
import { insertGeneratedFile } from '@/lib/db/queries';

import { createLogger } from '@/lib/logger';

const log = createLogger('generated-file-storage');

// Some image providers return large, losslessly-encoded PNGs (10MB+) for
// photorealistic content — fine for direct display, but several downstream
// consumers reject or choke on it: llama.cpp's built-in remote-image
// downloader (used for vision models) hard-caps fetches at 10MB and fails
// with a generic "cannot make GET request" once exceeded, and other vision
// APIs have their own (often smaller) limits. Re-encoding photographic
// content as JPEG typically shrinks it 5-10x with no visible quality loss;
// images with an alpha channel (icons/logos with transparency) stay PNG.
const MAX_IMAGE_DIMENSION = 2048;
const JPEG_QUALITY = 90;

async function compressGeneratedImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const resized = image.resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });

    if (metadata.hasAlpha) {
      return { buffer: await resized.png({ compressionLevel: 9 }).toBuffer(), contentType: 'image/png' };
    }
    return {
      buffer: await resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(),
      contentType: 'image/jpeg',
    };
  } catch (error) {
    // Not a raster image sharp can decode — keep the original as-is.
    log.warn('Could not compress generated image, storing original:', error);
    return { buffer, contentType };
  }
}

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
  const { client: storageClient, bucketName: STORAGE_BUCKET_NAME, publicUrl: STORAGE_PUBLIC_URL } = getStorageClient();

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

    ({ buffer, contentType } = await compressGeneratedImage(buffer, contentType));

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
