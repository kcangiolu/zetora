import 'server-only';

import { and, desc, eq, isNotNull, or } from 'drizzle-orm';
import { userMcpServer } from '../schema';
import { ChatSDKError, databaseError } from '../../errors';
import { maindb } from '../index';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

export interface UserMcpServerInput {
  userId: string;
  name: string;
  transportType: 'http' | 'sse';
  url: string;
  authType: 'none' | 'bearer' | 'header' | 'oauth';
  encryptedCredentials?: string | null;
  oauthIssuerUrl?: string | null;
  oauthAuthorizationUrl?: string | null;
  oauthTokenUrl?: string | null;
  oauthScopes?: string | null;
  oauthClientId?: string | null;
  oauthClientSecretEncrypted?: string | null;
  oauthAccessTokenEncrypted?: string | null;
  oauthRefreshTokenEncrypted?: string | null;
  oauthAccessTokenExpiresAt?: Date | null;
  oauthConnectedAt?: Date | null;
  oauthError?: string | null;
  isEnabled?: boolean;
}

export async function createUserMcpServer(input: UserMcpServerInput) {
  try {
    const [created] = await maindb
      .insert(userMcpServer)
      .values({
        userId: input.userId,
        name: input.name,
        transportType: input.transportType,
        url: input.url,
        authType: input.authType,
        encryptedCredentials: input.encryptedCredentials ?? null,
        oauthIssuerUrl: input.oauthIssuerUrl ?? null,
        oauthAuthorizationUrl: input.oauthAuthorizationUrl ?? null,
        oauthTokenUrl: input.oauthTokenUrl ?? null,
        oauthScopes: input.oauthScopes ?? null,
        oauthClientId: input.oauthClientId ?? null,
        oauthClientSecretEncrypted: input.oauthClientSecretEncrypted ?? null,
        oauthAccessTokenEncrypted: input.oauthAccessTokenEncrypted ?? null,
        oauthRefreshTokenEncrypted: input.oauthRefreshTokenEncrypted ?? null,
        oauthAccessTokenExpiresAt: input.oauthAccessTokenExpiresAt ?? null,
        oauthConnectedAt: input.oauthConnectedAt ?? null,
        oauthError: input.oauthError ?? null,
        isEnabled: input.isEnabled ?? true,
      })
      .returning();

    return created;
  } catch (error) {
    throw databaseError('Failed to create MCP server', error);
  }
}

export async function getUserMcpServersByUserId({
  userId,
  enabledOnly = false,
}: {
  userId: string;
  enabledOnly?: boolean;
}) {
  try {
    return await maindb
      .select()
      .from(userMcpServer)
      .where(
        enabledOnly
          ? and(
              eq(userMcpServer.userId, userId),
              eq(userMcpServer.isEnabled, true),
              // Skip OAuth servers that haven't completed authorization
              or(
                eq(userMcpServer.authType, 'none'),
                eq(userMcpServer.authType, 'bearer'),
                eq(userMcpServer.authType, 'header'),
                and(eq(userMcpServer.authType, 'oauth'), isNotNull(userMcpServer.oauthConnectedAt)),
              ),
            )
          : eq(userMcpServer.userId, userId),
      )
      .orderBy(desc(userMcpServer.createdAt));
  } catch (error) {
    throw databaseError('Failed to fetch MCP servers', error);
  }
}

export async function getUserMcpServerById({ id, userId }: { id: string; userId: string }) {
  try {
    const [server] = await maindb
      .select()
      .from(userMcpServer)
      .where(and(eq(userMcpServer.id, id), eq(userMcpServer.userId, userId)))
      .limit(1);
    return server ?? null;
  } catch (error) {
    throw databaseError('Failed to fetch MCP server', error);
  }
}

export async function updateUserMcpServer({
  id,
  userId,
  values,
}: {
  id: string;
  userId: string;
  values: Partial<{
    name: string;
    transportType: 'http' | 'sse';
    url: string;
    authType: 'none' | 'bearer' | 'header' | 'oauth';
    encryptedCredentials: string | null;
    oauthIssuerUrl: string | null;
    oauthAuthorizationUrl: string | null;
    oauthTokenUrl: string | null;
    oauthScopes: string | null;
    oauthClientId: string | null;
    oauthClientSecretEncrypted: string | null;
    oauthAccessTokenEncrypted: string | null;
    oauthRefreshTokenEncrypted: string | null;
    oauthAccessTokenExpiresAt: Date | null;
    oauthConnectedAt: Date | null;
    oauthError: string | null;
    isEnabled: boolean;
    disabledTools: string[];
    lastTestedAt: Date | null;
    lastError: string | null;
  }>;
}) {
  try {
    const [updated] = await maindb
      .update(userMcpServer)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(and(eq(userMcpServer.id, id), eq(userMcpServer.userId, userId)))
      .returning();
    return updated ?? null;
  } catch (error) {
    throw databaseError('Failed to update MCP server', error);
  }
}

export async function deleteUserMcpServer({ id, userId }: { id: string; userId: string }) {
  try {
    const [deleted] = await maindb
      .delete(userMcpServer)
      .where(and(eq(userMcpServer.id, id), eq(userMcpServer.userId, userId)))
      .returning();
    return deleted ?? null;
  } catch (error) {
    throw databaseError('Failed to delete MCP server', error);
  }
}

// Dodo Subscription CRUD operations
