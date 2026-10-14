import 'server-only';

import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { chat, uploadedFile, type Message } from '../schema';
import { maindb } from '../index';

import { createLogger } from '@/lib/logger';

const log = createLogger('uploaded-files');

export interface InsertUploadedFileParams {
  userId: string;
  key: string;
  url: string;
  filename: string;
  mediaType?: string | null;
  sizeBytes?: number | null;
}

// Idempotent on key, so a retried confirm returns the row it already created.
export async function insertUploadedFile(params: InsertUploadedFileParams) {
  const [inserted] = await maindb
    .insert(uploadedFile)
    .values({
      userId: params.userId,
      key: params.key,
      url: params.url,
      filename: params.filename,
      mediaType: params.mediaType ?? null,
      sizeBytes: params.sizeBytes ?? null,
    })
    .onConflictDoNothing({ target: uploadedFile.key })
    .returning();
  if (inserted) return inserted;

  const [existing] = await maindb.select().from(uploadedFile).where(eq(uploadedFile.key, params.key)).limit(1);
  return existing ?? null;
}

// Pagination cursor: the last row's createdAt and id. createdAt alone isn't
// unique (files attached to one message share it after the backfill), so id
// breaks ties and no row is skipped when a page boundary falls inside them.
export interface UploadedFilesCursor {
  createdAt: Date;
  id: string;
}

function encodeUploadedFilesCursor({ createdAt, id }: UploadedFilesCursor): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function decodeUploadedFilesCursor(raw: string): UploadedFilesCursor | null {
  const separator = raw.indexOf('|');
  if (separator === -1) return null;
  const createdAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

export async function getUploadedFilesByUserId({
  userId,
  limit,
  cursor,
}: {
  userId: string;
  limit: number;
  cursor?: UploadedFilesCursor;
}) {
  const rows = await maindb
    .select()
    .from(uploadedFile)
    .where(
      cursor
        ? and(
            eq(uploadedFile.userId, userId),
            or(
              lt(uploadedFile.createdAt, cursor.createdAt),
              and(eq(uploadedFile.createdAt, cursor.createdAt), lt(uploadedFile.id, cursor.id)),
            ),
          )
        : eq(uploadedFile.userId, userId),
    )
    .orderBy(desc(uploadedFile.createdAt), desc(uploadedFile.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    files: page,
    nextCursor: hasMore ? encodeUploadedFilesCursor(page[page.length - 1]!) : null,
  };
}

// The storage object is removed inside the transaction: if storage fails the
// row stays, the request errors and the user can retry, instead of a file
// that looks deleted but is still served. S3 treats a missing key as deleted.
export async function deleteUploadedFileByUrl({
  url,
  userId,
  removeObject,
}: {
  url: string;
  userId: string;
  removeObject: (key: string) => Promise<unknown>;
}) {
  return maindb.transaction(async (tx) => {
    const [row] = await tx
      .delete(uploadedFile)
      .where(and(eq(uploadedFile.url, url), eq(uploadedFile.userId, userId)))
      .returning();
    if (row) await removeObject(row.key);
    return row ?? null;
  });
}

// Ties each uploaded file to the chat of the first user message carrying it.
// Only the chat owner's own uploads are linked, and an already-linked file
// keeps its chat (a forked chat copying the message doesn't steal it).
// Non-fatal by design: this only feeds the "open chat" link in Settings →
// Uploads, and must never make saving the messages themselves fail.
export async function linkUploadedFilesToChats(messages: Array<Pick<Message, 'chatId' | 'role' | 'parts'>>) {
  const urlsByChatId = new Map<string, string[]>();
  for (const messageItem of messages) {
    if (messageItem.role !== 'user') continue;
    const parts = Array.isArray(messageItem.parts) ? (messageItem.parts as Array<{ type?: string; url?: unknown }>) : [];
    for (const part of parts) {
      if (part.type !== 'file' || typeof part.url !== 'string') continue;
      const urls = urlsByChatId.get(messageItem.chatId) ?? [];
      urls.push(part.url);
      urlsByChatId.set(messageItem.chatId, urls);
    }
  }

  for (const [chatId, urls] of urlsByChatId) {
    try {
      await maindb
        .update(uploadedFile)
        .set({ chatId })
        .where(
          and(
            inArray(uploadedFile.url, urls),
            isNull(uploadedFile.chatId),
            eq(uploadedFile.userId, sql`(SELECT ${chat.userId} FROM ${chat} WHERE ${chat.id} = ${chatId})`),
          ),
        );
    } catch (error) {
      log.error('Failed to link uploaded files to chat:', error);
    }
  }
}
