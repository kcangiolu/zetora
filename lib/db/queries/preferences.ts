import 'server-only';

import { eq } from 'drizzle-orm';
import { userPreferences, type UserPreferenceValues } from '../schema';
import { databaseError } from '../../errors';
import { maindb } from '../index';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

import { createLogger } from '@/lib/logger';

const log = createLogger('db-preferences');

// User Preferences CRUD operations
//
// One preference field holds third-party API keys the user types in
// (zetora-custom-providers[].apiKey). They are
// encrypted at rest with the same AES-256-GCM scheme as MCP credentials, so a
// DB dump/backup/replica never contains a usable secret. Encryption happens
// on write (upsertUserPreferences) and decryption on read
// (getUserPreferencesByUserId) so every caller — internal usage and the
// user's own settings UI alike — keeps seeing plain values.
const ENCRYPTED_SECRET_PATTERN = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

function isEncryptedSecret(value: unknown): value is string {
  return typeof value === 'string' && ENCRYPTED_SECRET_PATTERN.test(value);
}

// Decrypting: a corrupt value or a rotated key must not take down the whole
// preferences read, so that one field is logged and left as stored, and the
// provider it belongs to then fails with an authentication error. Encrypting
// has no such exception: a key that cannot be encrypted is never written.
function decryptSecretOrKeep(value: string, label: string): string {
  try {
    return decryptMcpCredentials(value);
  } catch (error) {
    log.error(`[preferences] Failed to decrypt secret field "${label}":`, error);
    return value;
  }
}

function mapPreferenceSecrets<T extends Record<string, unknown>>(
  preferences: T,
  transform: (value: string, label: string) => string,
  shouldTransform: (value: unknown) => value is string,
): T {
  const next: Record<string, unknown> = { ...preferences };

  if (Array.isArray(next['zetora-custom-providers'])) {
    next['zetora-custom-providers'] = (next['zetora-custom-providers'] as Array<{ apiKey?: unknown }>).map(
      (provider) =>
        provider && shouldTransform(provider.apiKey)
          ? { ...provider, apiKey: transform(provider.apiKey, 'zetora-custom-providers.apiKey') }
          : provider,
    );
  }

  return next as T;
}

function encryptPreferenceSecrets<T extends Record<string, unknown>>(preferences: T): T {
  return mapPreferenceSecrets(
    preferences,
    (value) => encryptMcpCredentials(value),
    (value): value is string => typeof value === 'string' && value.length > 0 && !isEncryptedSecret(value),
  );
}

function decryptPreferenceSecrets<T extends Record<string, unknown>>(preferences: T): T {
  return mapPreferenceSecrets(preferences, decryptSecretOrKeep, isEncryptedSecret);
}

export async function getUserPreferencesByUserId({ userId }: { userId: string }) {
  try {
    const [preferences] = await maindb
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (!preferences) return null;

    return { ...preferences, preferences: decryptPreferenceSecrets(preferences.preferences) };
  } catch (error) {
    log.error('Error getting user preferences:', error);
    return null;
  }
}

export async function upsertUserPreferences({
  userId,
  preferences,
}: {
  userId: string;
  preferences: UserPreferenceValues;
}) {
  try {
    // Encrypt secret fields (custom-provider API keys) before they
    // ever reach the DB — existingPrefs read below is already encrypted, so
    // only the caller-supplied delta needs transforming here.
    const encryptedUpdates = encryptPreferenceSecrets(preferences);

    // Use transaction to ensure atomicity of read-modify-write
    return await maindb.transaction(async (tx) => {
      // Lock the row for the duration of the transaction so concurrent
      // upserts (e.g. multiple useSyncedPreferences keys saved in quick
      // succession) are serialized instead of clobbering each other.
      const [existing] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .for('update')
        .limit(1);

      const existingPrefs = existing?.preferences || {};

      // Merge existing with new updates
      const mergedPreferences = {
        ...existingPrefs,
        ...encryptedUpdates,
      };

      if (existing) {
        // Update existing record
        const [updated] = await tx
          .update(userPreferences)
          .set({
            preferences: mergedPreferences,
            updatedAt: new Date(),
          })
          .where(eq(userPreferences.userId, userId))
          .returning();
        return { ...updated, preferences: decryptPreferenceSecrets(updated.preferences) };
      } else {
        // Insert new record. If a concurrent transaction inserted the row
        // first (FOR UPDATE locks nothing on a row that doesn't exist yet),
        // fall back to merging into that row instead of erroring out.
        const [newPreferences] = await tx
          .insert(userPreferences)
          .values({
            userId,
            preferences: mergedPreferences,
          })
          .onConflictDoUpdate({
            target: userPreferences.userId,
            set: {
              preferences: mergedPreferences,
              updatedAt: new Date(),
            },
          })
          .returning();
        return { ...newPreferences, preferences: decryptPreferenceSecrets(newPreferences.preferences) };
      }
    });
  } catch (error) {
    throw databaseError('Failed to upsert user preferences', error);
  }
}
