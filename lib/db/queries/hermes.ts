import 'server-only';

import { and, eq, gt } from 'drizzle-orm';
import { hermesConnector, hermesConversation, message } from '../schema';
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

// A connector can own MANY conversations — one per Zetora chat that has ever used Agent
// mode (see createHermesConversation above) — so this is deliberately plural. A
// connector-wide event (gateway connect/disconnect) is relevant to every chat that might
// currently have it open, not just one.
export async function getHermesConversationsByConnectorId(connectorId: string) {
  try {
    return await maindb.select().from(hermesConversation).where(eq(hermesConversation.connectorId, connectorId));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to fetch Hermes conversations');
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

export type HermesChatLock = 'hermes' | 'search' | null;

// Which lane a chat is permanently committed to, decided by its FIRST message: 'hermes'
// once a hermesConversation row exists for it (created lazily by /api/hermes/send on the
// first Agent-mode message), 'search' once it has any message at all but no
// hermesConversation (a native Zetora search turn got there first), or null for a chat
// that hasn't received its first message yet — still free to become either. Both
// directions get enforced from this single source of truth: the client hides the
// now-irrelevant mode option (components/ui/form-component/index.tsx), and
// /api/search + /api/hermes/send each reject a request that would cross the lock.
export async function getHermesChatLock(chatId: string): Promise<HermesChatLock> {
  try {
    const conversation = await getHermesConversationByChatId(chatId);
    if (conversation) return 'hermes';
    const [existingMessage] = await maindb
      .select({ id: message.id })
      .from(message)
      .where(eq(message.chatId, chatId))
      .limit(1);
    return existingMessage ? 'search' : null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to resolve Hermes chat lock');
  }
}
