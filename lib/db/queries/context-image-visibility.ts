import 'server-only';

import { and, eq } from 'drizzle-orm';
import { hiddenContextImage } from '../schema';
import { maindb } from '../index';

export async function hideContextImage({
  chatId,
  userId,
  imageUrl,
}: {
  chatId: string;
  userId: string;
  imageUrl: string;
}): Promise<void> {
  await maindb.insert(hiddenContextImage).values({ chatId, userId, imageUrl }).onConflictDoNothing();
}

export async function unhideContextImage({ chatId, imageUrl }: { chatId: string; imageUrl: string }): Promise<void> {
  await maindb
    .delete(hiddenContextImage)
    .where(and(eq(hiddenContextImage.chatId, chatId), eq(hiddenContextImage.imageUrl, imageUrl)));
}

export async function getHiddenContextImageUrlsByChatId({ chatId }: { chatId: string }): Promise<string[]> {
  const rows = await maindb
    .select({ imageUrl: hiddenContextImage.imageUrl })
    .from(hiddenContextImage)
    .where(eq(hiddenContextImage.chatId, chatId));
  return rows.map((r) => r.imageUrl);
}
