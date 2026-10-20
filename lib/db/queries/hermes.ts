import 'server-only';

import { and, asc, eq, gt } from 'drizzle-orm';
import { hermesConnector, hermesConversation, hermesToolStep, message, type HermesToolStepStatus } from '../schema';
import { ChatSDKError, databaseError } from '../../errors';
import { maindb } from '../index';
import { resolveHermesChatLock, type HermesChatLock } from '@/lib/hermes/chat-mode';

export type { HermesChatLock };

export interface CreateHermesConnectorInput {
  userId: string;
  label?: string | null;
  enrollmentTokenHash: string;
  enrollmentTokenExpiresAt: Date;
}

export async function createHermesConnector(input: CreateHermesConnectorInput) {
  try {
    const [created] = await maindb
      .insert(hermesConnector)
      .values({
        userId: input.userId,
        label: input.label ?? null,
        enrollmentTokenHash: input.enrollmentTokenHash,
        enrollmentTokenExpiresAt: input.enrollmentTokenExpiresAt,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: hermesConnector.userId,
        set: {
          label: input.label ?? null,
          enrollmentTokenHash: input.enrollmentTokenHash,
          enrollmentTokenExpiresAt: input.enrollmentTokenExpiresAt,
          status: 'pending',
          gatewayId: null,
          gatewaySecretEncrypted: null,
          gatewaySecretPrefix: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return created;
  } catch (error) {
    throw databaseError('Failed to create Hermes connector', error);
  }
}

export async function getHermesConnectorByUserId(userId: string) {
  try {
    const [connector] = await maindb.select().from(hermesConnector).where(eq(hermesConnector.userId, userId)).limit(1);
    return connector ?? null;
  } catch (error) {
    throw databaseError('Failed to fetch Hermes connector', error);
  }
}

export async function getHermesConnectorByGatewayId(gatewayId: string) {
  try {
    const [connector] = await maindb
      .select()
      .from(hermesConnector)
      .where(eq(hermesConnector.gatewayId, gatewayId))
      .limit(1);
    return connector ?? null;
  } catch (error) {
    throw databaseError('Failed to fetch Hermes connector', error);
  }
}

export async function getPendingHermesConnectorByEnrollmentTokenHash(enrollmentTokenHash: string) {
  try {
    const [connector] = await maindb
      .select()
      .from(hermesConnector)
      .where(
        and(
          eq(hermesConnector.enrollmentTokenHash, enrollmentTokenHash),
          eq(hermesConnector.status, 'pending'),
          gt(hermesConnector.enrollmentTokenExpiresAt, new Date()),
        ),
      )
      .limit(1);
    return connector ?? null;
  } catch (error) {
    throw databaseError('Failed to fetch pending Hermes connector', error);
  }
}

export async function markHermesConnectorEnrolled({
  id,
  gatewayId,
  gatewaySecretEncrypted,
  gatewaySecretPrefix,
}: {
  id: string;
  gatewayId: string;
  gatewaySecretEncrypted: string;
  gatewaySecretPrefix: string;
}) {
  try {
    const [updated] = await maindb
      .update(hermesConnector)
      .set({
        status: 'enrolled',
        gatewayId,
        gatewaySecretEncrypted,
        gatewaySecretPrefix,
        enrollmentTokenHash: null,
        enrollmentTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(hermesConnector.id, id))
      .returning();
    return updated ?? null;
  } catch (error) {
    throw databaseError('Failed to enroll Hermes connector', error);
  }
}

export async function updateHermesConnectorConnectionStatus({
  gatewayId,
  connected,
  error,
}: {
  gatewayId: string;
  connected: boolean;
  error?: string | null;
}) {
  try {
    const [updated] = await maindb
      .update(hermesConnector)
      .set({
        lastConnectedAt: connected ? new Date() : undefined,
        lastDisconnectedAt: connected ? undefined : new Date(),
        lastError: error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(hermesConnector.gatewayId, gatewayId))
      .returning();
    return updated ?? null;
  } catch (error_) {
    throw databaseError('Failed to update Hermes connector status', error_);
  }
}

export async function revokeHermesConnector({ id, userId }: { id: string; userId: string }) {
  try {
    const [updated] = await maindb
      .update(hermesConnector)
      .set({
        status: 'revoked',
        gatewaySecretEncrypted: null,
        gatewaySecretPrefix: null,
        updatedAt: new Date(),
      })
      .where(and(eq(hermesConnector.id, id), eq(hermesConnector.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (error) {
    throw databaseError('Failed to revoke Hermes connector', error);
  }
}

export async function createHermesConversation({ chatId, connectorId }: { chatId: string; connectorId: string }) {
  try {
    const [created] = await maindb.insert(hermesConversation).values({ chatId, connectorId }).returning();
    return created;
  } catch (error) {
    throw databaseError('Failed to create Hermes conversation', error);
  }
}

// A connector can own MANY conversations — one per Zetora chat that has ever used Agent
// mode (see createHermesConversation above) — so this is deliberately plural. A
// connector-wide event (gateway connect/disconnect) is relevant to every chat that might
// currently have it open, not just one.
export async function getHermesConversationsByConnectorId(connectorId: string) {
  try {
    return await maindb.select().from(hermesConversation).where(eq(hermesConversation.connectorId, connectorId));
  } catch (error) {
    throw databaseError('Failed to fetch Hermes conversations', error);
  }
}

export async function getHermesConversationByChatId(chatId: string) {
  try {
    const [conversation] = await maindb
      .select()
      .from(hermesConversation)
      .where(eq(hermesConversation.chatId, chatId))
      .limit(1);
    return conversation ?? null;
  } catch (error) {
    throw databaseError('Failed to fetch Hermes conversation', error);
  }
}

// The rule itself lives in lib/hermes/chat-mode.ts so the client can apply it to
// server-rendered data without reaching for this server-only module; this is the
// DB-reading wrapper around it. /api/search and /api/hermes/send each reject a request
// that would cross the lock, using this as the single source of truth.
export async function getHermesChatLock(chatId: string): Promise<HermesChatLock> {
  try {
    const conversation = await getHermesConversationByChatId(chatId);
    if (conversation) {
      return resolveHermesChatLock({ hasHermesConversation: true, hasMessages: true });
    }
    const [existingMessage] = await maindb
      .select({ id: message.id })
      .from(message)
      .where(eq(message.chatId, chatId))
      .limit(1);
    return resolveHermesChatLock({ hasHermesConversation: false, hasMessages: Boolean(existingMessage) });
  } catch (error) {
    throw databaseError('Failed to resolve Hermes chat lock', error);
  }
}

// A start event can be delivered twice (the plugin's request retried after a lost
// response), so the second insert leaves the first row as it is.
export async function startHermesToolStep(step: {
  chatId: string;
  toolCallId: string;
  triggerMessageId: string | null;
  toolName: string;
  preview: string | null;
}) {
  try {
    await maindb
      .insert(hermesToolStep)
      .values({ ...step, status: 'running' })
      .onConflictDoNothing();
    const [row] = await maindb
      .select()
      .from(hermesToolStep)
      .where(and(eq(hermesToolStep.chatId, step.chatId), eq(hermesToolStep.toolCallId, step.toolCallId)))
      .limit(1);
    return row;
  } catch (error) {
    throw databaseError('Failed to record Hermes tool step', error);
  }
}

// Null when no start was recorded for this call: there is nothing to show a result for.
export async function finishHermesToolStep(step: {
  chatId: string;
  toolCallId: string;
  status: Exclude<HermesToolStepStatus, 'running'>;
  durationMs: number | null;
}) {
  try {
    const [row] = await maindb
      .update(hermesToolStep)
      .set({ status: step.status, durationMs: step.durationMs })
      .where(and(eq(hermesToolStep.chatId, step.chatId), eq(hermesToolStep.toolCallId, step.toolCallId)))
      .returning();
    return row ?? null;
  } catch (error) {
    throw databaseError('Failed to finish Hermes tool step', error);
  }
}

export async function getHermesToolStepsByChatId(chatId: string) {
  try {
    return await maindb
      .select()
      .from(hermesToolStep)
      .where(eq(hermesToolStep.chatId, chatId))
      .orderBy(asc(hermesToolStep.startedAt));
  } catch (error) {
    throw databaseError('Failed to fetch Hermes tool steps', error);
  }
}
