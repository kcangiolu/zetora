import 'server-only';

import { and, desc, eq, lt } from 'drizzle-orm';
import { generatedFile } from '../schema';
import { maindb } from '../index';

import { createLogger } from '@/lib/logger';

const log = createLogger('generated-files');

export interface InsertGeneratedFileParams {
  userId: string;
  chatId?: string | null;
  key: string;
  url: string;
  filename: string;
  mediaType?: string | null;
  kind: 'image' | 'document';
  toolName?: string | null;
  sizeBytes?: number | null;
}

// Non-fatal by design: the upload to storage already succeeded by the time
// this is called, so a DB hiccup here shouldn't surface as a tool failure —
// worst case the file just won't show up in Settings → Downloads.
export async function insertGeneratedFile(params: InsertGeneratedFileParams) {
  try {
    const [row] = await maindb
      .insert(generatedFile)
      .values({
        userId: params.userId,
        chatId: params.chatId ?? null,
        key: params.key,
        url: params.url,
        filename: params.filename,
        mediaType: params.mediaType ?? null,
        kind: params.kind,
        toolName: params.toolName ?? null,
        sizeBytes: params.sizeBytes ?? null,
      })
      .returning();
    return row ?? null;
  } catch (error) {
    log.error('Failed to insert generated file record:', error);
    return null;
  }
}

export async function getGeneratedFilesByUserId({
  userId,
  limit,
  cursor,
}: {
  userId: string;
  limit: number;
  cursor?: string;
}) {
  const rows = await maindb
    .select()
    .from(generatedFile)
    .where(
      cursor
        ? and(eq(generatedFile.userId, userId), lt(generatedFile.createdAt, new Date(cursor)))
        : eq(generatedFile.userId, userId),
    )
    .orderBy(desc(generatedFile.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    files: page,
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}

// The storage object is removed inside the transaction: if storage fails the
// row stays, the request errors and the user can retry, instead of a file
// that looks deleted but is still served. S3 treats a missing key as deleted.
export async function deleteGeneratedFileById({
  id,
  userId,
  removeObject,
}: {
  id: string;
  userId: string;
  removeObject: (key: string) => Promise<unknown>;
}) {
  return maindb.transaction(async (tx) => {
    const [row] = await tx
      .delete(generatedFile)
      .where(and(eq(generatedFile.id, id), eq(generatedFile.userId, userId)))
      .returning();
    if (row) await removeObject(row.key);
    return row ?? null;
  });
}
