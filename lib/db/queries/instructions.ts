import 'server-only';

import { eq } from 'drizzle-orm';
import { customInstructions } from '../schema';
import { ChatSDKError, databaseError } from '../../errors';
import { db, maindb } from '../index';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

import { createLogger } from '@/lib/logger';

const log = createLogger('instructions');

// Custom Instructions CRUD operations
export async function getCustomInstructionsByUserId({ userId }: { userId: string }) {
  try {
    const [instructions] = await maindb
      .select()
      .from(customInstructions)
      .where(eq(customInstructions.userId, userId))
      .limit(1);

    return instructions ?? null;
  } catch (error) {
    log.error('Error getting custom instructions:', error);
    return null;
  }
}

export async function createCustomInstructions({ userId, content }: { userId: string; content: string }) {
  try {
    const [newInstructions] = await db
      .insert(customInstructions)
      .values({
        userId,
        content,
      })
      .returning();

    return newInstructions;
  } catch (error) {
    throw databaseError('Failed to create custom instructions', error);
  }
}

export async function updateCustomInstructions({ userId, content }: { userId: string; content: string }) {
  try {
    const [updatedInstructions] = await db
      .update(customInstructions)
      .set({
        content,
        updatedAt: new Date(),
      })
      .where(eq(customInstructions.userId, userId))
      .returning();

    return updatedInstructions;
  } catch (error) {
    throw databaseError('Failed to update custom instructions', error);
  }
}

export async function deleteCustomInstructions({ userId }: { userId: string }) {
  try {
    const [deletedInstructions] = await db
      .delete(customInstructions)
      .where(eq(customInstructions.userId, userId))
      .returning();

    return deletedInstructions;
  } catch (error) {
    throw databaseError('Failed to delete custom instructions', error);
  }
}

// User Preferences CRUD operations
//
// One preference field holds third-party API keys the user types in
// (zetora-custom-providers[].apiKey). They are
// encrypted at rest with the same AES-256-GCM scheme as MCP credentials, so a
// DB dump/backup/replica never contains a usable secret. Encryption happens
// on write (upsertUserPreferences) and decryption on read
// (getUserPreferencesByUserId) so every caller — internal usage and the
// user's own settings UI alike — keeps seeing plain values.
