import 'server-only';

import { and, eq, gt } from 'drizzle-orm';
import { hermesConnector, hermesConversation, hermesMessageLink } from '../schema';
import { ChatSDKError } from '../../errors';
import { maindb } from '../index';

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
    throw new ChatSDKError('bad_request:database', 'Failed to create Hermes connector');
  }
}

export async function getHermesConnectorByUserId(userId: string) {
  try {
    const [connector] = await maindb.select().from(hermesConnector).where(eq(hermesConnector.userId, userId)).limit(1);
    return connector ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to fetch Hermes connector');
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
    throw new ChatSDKError('bad_request:database', 'Failed to fetch Hermes connector');
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
    throw new ChatSDKError('bad_request:database', 'Failed to fetch pending Hermes connector');
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
    throw new ChatSDKError('bad_request:database', 'Failed to enroll Hermes connector');
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
    throw new ChatSDKError('bad_request:database', 'Failed to update Hermes connector status');
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
    throw new ChatSDKError('bad_request:database', 'Failed to revoke Hermes connector');
  }
}

export async function createHermesConversation({ chatId, connectorId }: { chatId: string; connectorId: string }) {
  try {
    const [created] = await maindb.insert(hermesConversation).values({ chatId, connectorId }).returning();
    return created;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create Hermes conversation');
  }
}

export async function getHermesConversationByConnectorId(connectorId: string) {
  try {
    const [conversation] = await maindb
      .select()
      .from(hermesConversation)
      .where(eq(hermesConversation.connectorId, connectorId))
      .limit(1);
    return conversation ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to fetch Hermes conversation');
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
    throw new ChatSDKError('bad_request:database', 'Failed to fetch Hermes conversation');
  }
}

export async function linkHermesMessage({ messageId, hermesMessageId }: { messageId: string; hermesMessageId: string }) {
  try {
    const [created] = await maindb.insert(hermesMessageLink).values({ messageId, hermesMessageId }).returning();
    return created;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to link Hermes message');
  }
}

export async function getMessageIdByHermesMessageId(hermesMessageId: string) {
  try {
    const [link] = await maindb
      .select()
      .from(hermesMessageLink)
      .where(eq(hermesMessageLink.hermesMessageId, hermesMessageId))
      .limit(1);
    return link?.messageId ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to resolve Hermes message link');
  }
}
