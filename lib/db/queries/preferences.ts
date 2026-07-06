import 'server-only';

import { eq } from 'drizzle-orm';
import { userPreferences } from '../schema';
import { ChatSDKError } from '../../errors';
import { maindb } from '../index';
import {
  getDodoSubscriptions,
  setDodoSubscriptions,
  getDodoProStatus,
  setDodoProStatus,
} from '../../performance-cache';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

// User Preferences CRUD operations
//
// Two preference fields hold third-party API keys the user types in
// (zetora-custom-providers[].apiKey, zetora-graphiti-llm-api-key). They are
// encrypted at rest with the same AES-256-GCM scheme as MCP credentials, so a
// DB dump/backup/replica never contains a usable secret. Encryption happens
// on write (upsertUserPreferences) and decryption on read
// (getUserPreferencesByUserId) so every caller — internal usage and the
// user's own settings UI alike — keeps seeing plain values.
const ENCRYPTED_SECRET_PATTERN = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

function isEncryptedSecret(value: unknown): value is string {
  return typeof value === 'string' && ENCRYPTED_SECRET_PATTERN.test(value);
}

// Applies `transform` to a single field, but never lets a bad key or corrupt
// value take down the whole preferences read/write — it logs and leaves that
// one field as-is instead.
function applyToSecret(value: string, transform: (value: string) => string, label: string): string {
  try {
    return transform(value);
  } catch (error) {
    console.error(`[preferences] Failed to process secret field "${label}":`, error);
    return value;
  }
}

function mapPreferenceSecrets<T extends Record<string, unknown>>(
  preferences: T,
  transform: (value: string) => string,
  shouldTransform: (value: unknown) => value is string,
): T {
  const next: Record<string, unknown> = { ...preferences };

  const graphitiKey = next['zetora-graphiti-llm-api-key'];
  if (shouldTransform(graphitiKey)) {
    next['zetora-graphiti-llm-api-key'] = applyToSecret(graphitiKey, transform, 'zetora-graphiti-llm-api-key');
  }

  if (Array.isArray(next['zetora-custom-providers'])) {
    next['zetora-custom-providers'] = (next['zetora-custom-providers'] as Array<{ apiKey?: unknown }>).map(
      (provider) =>
        provider && shouldTransform(provider.apiKey)
          ? { ...provider, apiKey: applyToSecret(provider.apiKey, transform, 'zetora-custom-providers.apiKey') }
          : provider,
    );
  }

  return next as T;
}

function encryptPreferenceSecrets<T extends Record<string, unknown>>(preferences: T): T {
  return mapPreferenceSecrets(
    preferences,
    encryptMcpCredentials,
    (value): value is string => typeof value === 'string' && value.length > 0 && !isEncryptedSecret(value),
  );
}

function decryptPreferenceSecrets<T extends Record<string, unknown>>(preferences: T): T {
  return mapPreferenceSecrets(preferences, decryptMcpCredentials, isEncryptedSecret);
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
    console.error('Error getting user preferences:', error);
    return null;
  }
}

export async function upsertUserPreferences({
  userId,
  preferences,
}: {
  userId: string;
  preferences: Partial<{
    'zetora-search-provider'?: 'exa' | 'parallel' | 'firecrawl' | 'searxng' | 'fastcrw';
    'zetora-storage-provider'?: 'cloudflare-r2' | 'minio';
    'zetora-searxng-url'?: string;
    'zetora-fastcrw-url'?: string;
    'zetora-extreme-content-provider'?: 'exa-firecrawl' | 'searxng-fastcrw' | 'notte-only';
    'zetora-email-provider'?: 'resend' | 'smtp';
    'zetora-group-order'?: string[];
    'zetora-model-order-global'?: string[];
    'zetora-blur-personal-info'?: boolean;
    'zetora-custom-instructions-enabled'?: boolean;
    'zetora-scroll-to-latest-on-open'?: boolean;
    'zetora-location-metadata-enabled'?: boolean;
    'zetora-auto-router-enabled'?: boolean;
    'zetora-auto-router-config'?: {
      routes: Array<{
        name: string;
        description: string;
        model: string;
      }>;
    };
    'zetora-custom-providers'?: Array<{
      id: string;
      name: string;
      baseURL: string;
      apiKey?: string;
      disableAutoDetect?: boolean;
      anonymize?: boolean;
    }>;
    'zetora-anonymization-enabled'?: boolean;
    'zetora-anonymization-custom-terms'?: string[];
    'zetora-anonymization-fail-open'?: boolean;
    'zetora-default-model'?: string;
    'zetora-default-provider'?: string;
    'zetora-lockout-provider'?: 'qstash' | 'bullmq';
    'zetora-memory-provider'?: 'supermemory' | 'graphiti';
    'zetora-graphiti-api-url'?: string;
    'zetora-graphiti-llm-model'?: string;
    'zetora-graphiti-llm-base-url'?: string;
    'zetora-graphiti-llm-api-key'?: string;
    'zetora-graphiti-active-provider'?: string;
    'zetora-graphiti-embedding-provider'?: string;
    'zetora-graphiti-embedding-model'?: string;
    'zetora-embedding-enabled'?: boolean;
    'zetora-xml-tool-parsing-enabled'?: boolean;
    'zetora-graphiti-chunk-size'?: number;
    'zetora-graphiti-max-retries'?: number;
    'zetora-graphiti-chunk-delay-ms'?: number;
    'zetora-fallback-firecrawl-content'?: boolean;
    'zetora-fallback-metadata'?: boolean;
    'zetora-fallback-notte'?: boolean;
    'zetora-fallback-exa-browse'?: boolean;
    'zetora-fallback-search-firecrawl'?: boolean;
    'zetora-fallback-retrieve-parallel'?: boolean;
    'zetora-fallback-retrieve-firecrawl'?: boolean;
    'zetora-voice-s2s-backend'?: 'cloud' | 'local';
    'zetora-tertiary-voice-model'?: string;
    'zetora-tertiary-voice-provider'?: string;
  }>;
}) {
  try {
    // Encrypt secret fields (custom-provider / Graphiti API keys) before they
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
    throw new ChatSDKError('bad_request:database', 'Failed to upsert user preferences');
  }
}
