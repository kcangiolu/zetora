import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { chat, buildSession } from '../schema';
import { maindb } from '../index';
import {
  getDodoSubscriptions,
  setDodoSubscriptions,
  getDodoProStatus,
  setDodoProStatus,
} from '../../performance-cache';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

export async function createBuildSession({
  chatId,
  userId,
  boxId,
  runtime = 'node',
}: {
  chatId: string;
  userId: string;
  boxId?: string | null;
  runtime?: string;
}) {
  try {
    const [created] = await maindb
      .insert(buildSession)
      .values({
        chatId,
        userId,
        boxId: boxId ?? null,
        runtime,
        status: 'active',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to create agent session:', error);
    return null;
  }
}

export async function updateBuildSession({
  chatId,
  status,
  boxId,
  runtime,
  snapshotId,
  totalCostUsd,
  totalComputeMs,
  totalInputTokens,
  totalOutputTokens,
}: {
  chatId: string;
  status?: string;
  boxId?: string | null;
  runtime?: string;
  snapshotId?: string | null;
  totalCostUsd?: number | null;
  totalComputeMs?: number | null;
  totalInputTokens?: number | null;
  totalOutputTokens?: number | null;
}) {
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (boxId !== undefined) updates.boxId = boxId;
    if (runtime !== undefined) updates.runtime = runtime;
    if (snapshotId !== undefined) updates.snapshotId = snapshotId;
    if (totalCostUsd !== undefined) updates.totalCostUsd = totalCostUsd;
    if (totalComputeMs !== undefined) updates.totalComputeMs = totalComputeMs;
    if (totalInputTokens !== undefined) updates.totalInputTokens = totalInputTokens;
    if (totalOutputTokens !== undefined) updates.totalOutputTokens = totalOutputTokens;
    if (status === 'completed' || status === 'error') updates.completedAt = new Date();

    await maindb.update(buildSession).set(updates).where(eq(buildSession.chatId, chatId));
  } catch (error) {
    console.error('Failed to update agent session:', error);
  }
}

export async function getBuildSessionByChatId({ chatId }: { chatId: string }) {
  try {
    const [result] = await maindb.select().from(buildSession).where(eq(buildSession.chatId, chatId)).limit(1);
    return result ?? null;
  } catch (error) {
    console.error('Failed to get agent session:', error);
    return null;
  }
}

export async function getBuildSessionsByUserId({ userId, limit = 20 }: { userId: string; limit?: number }): Promise<
  Array<{
    id: string;
    chatId: string;
    title: string;
    status: string;
    runtime: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
  }>
> {
  try {
    const results = await maindb
      .select({
        id: buildSession.id,
        chatId: buildSession.chatId,
        title: chat.title,
        status: buildSession.status,
        runtime: buildSession.runtime,
        createdAt: buildSession.createdAt,
        updatedAt: buildSession.updatedAt,
        completedAt: buildSession.completedAt,
      })
      .from(buildSession)
      .innerJoin(chat, eq(buildSession.chatId, chat.id))
      .where(eq(buildSession.userId, userId))
      .orderBy(desc(buildSession.createdAt))
      .limit(limit);

    return results;
  } catch (error) {
    console.error('Failed to get agent sessions:', error);
    return [];
  }
}
