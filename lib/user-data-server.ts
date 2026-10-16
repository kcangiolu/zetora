import 'server-only';

import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { user } from './db/schema';
import { maindb } from './db';
import { auth } from './auth';
import { headers } from 'next/headers';
import { getCustomInstructionsByUserId, getUserPreferencesByUserId } from './db/queries';
import type { CustomInstructions, UserPreferences } from './db/schema';
import { sessionCache, createSessionKey } from './performance-cache';
import { globalCache } from './lru-ttl-cache';

// Reverse mapping: userId → Set of session tokens, so we can invalidate all sessions when user data changes
const userSessionTokens = new Map<string, Set<string>>();

function createLightweightAuthSessionKey(token: string): string {
  return `lightweight-auth:${token}`;
}

export function invalidateSessionCacheForToken(token: string): void {
  sessionCache.delete(createSessionKey(token));
  sessionCache.delete(createLightweightAuthSessionKey(token));
  // Clean up reverse map entries for this token
  for (const [userId, tokens] of userSessionTokens.entries()) {
    if (tokens.delete(token) && tokens.size === 0) {
      userSessionTokens.delete(userId);
    }
  }
}

import { createLogger } from '@/lib/logger';

const log = createLogger('user-data-server');

// Payment/tier notions were removed: any connected account has access to everything.
export interface ComprehensiveUserData {
  id: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  name: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Lightweight user auth type for fast checks
export interface LightweightUserAuth {
  userId: string;
  email: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LIGHTWEIGHT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes - shorter for lightweight checks
const USER_DATA_CACHE_MAX = 2000;
const LIGHTWEIGHT_AUTH_CACHE_MAX = 3000;
const CUSTOM_INSTRUCTIONS_CACHE_MAX = 2000;
const USER_PREFERENCES_CACHE_MAX = 2000;

const userDataCache = globalCache<ComprehensiveUserData>('__zetoraUserDataCache', USER_DATA_CACHE_MAX);
const lightweightAuthCache = globalCache<LightweightUserAuth>(
  '__zetoraLightweightAuthCache',
  LIGHTWEIGHT_AUTH_CACHE_MAX,
);

// Custom instructions cache (per-user)
const customInstructionsCache = globalCache<CustomInstructions | null>(
  '__zetoraCustomInstructionsCache',
  CUSTOM_INSTRUCTIONS_CACHE_MAX,
);
const CUSTOM_INSTRUCTIONS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// User preferences cache (per-user)
const userPreferencesCache = globalCache<UserPreferences | null>(
  '__zetoraUserPreferencesCache',
  USER_PREFERENCES_CACHE_MAX,
);
const USER_PREFERENCES_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCachedUserData(userId: string): ComprehensiveUserData | null {
  return userDataCache.get(userId) ?? null;
}

function setCachedUserData(userId: string, data: ComprehensiveUserData): void {
  userDataCache.set(userId, data, CACHE_TTL_MS);
}

function getCachedLightweightAuth(userId: string): LightweightUserAuth | null {
  return lightweightAuthCache.get(userId) ?? null;
}

function setCachedLightweightAuth(userId: string, data: LightweightUserAuth): void {
  lightweightAuthCache.set(userId, data, LIGHTWEIGHT_CACHE_TTL_MS);
}

/**
 * Get custom instructions for a user with in-memory caching.
 * Falls back to DB via getCustomInstructionsByUserId when cache miss/expired.
 */
export async function getCachedCustomInstructionsByUserId(
  userId: string,
  options?: { ttlMs?: number },
): Promise<CustomInstructions | null> {
  const ttlMs = options?.ttlMs ?? CUSTOM_INSTRUCTIONS_CACHE_TTL_MS;
  const cached = customInstructionsCache.get(userId);
  if (cached !== undefined) {
    return cached;
  }

  const instructions = await getCustomInstructionsByUserId({ userId });
  customInstructionsCache.set(userId, instructions ?? null, ttlMs);
  return instructions ?? null;
}

/**
 * Get user preferences for a user with in-memory caching.
 * Falls back to DB via getUserPreferencesByUserId when cache miss/expired.
 */
export async function getCachedUserPreferencesByUserId(
  userId: string,
  options?: { ttlMs?: number },
): Promise<UserPreferences | null> {
  const ttlMs = options?.ttlMs ?? USER_PREFERENCES_CACHE_TTL_MS;
  const cached = userPreferencesCache.get(userId);
  if (cached !== undefined) {
    return cached;
  }

  const preferences = await getUserPreferencesByUserId({ userId });
  userPreferencesCache.set(userId, preferences ?? null, ttlMs);
  return preferences ?? null;
}

export function clearUserPreferencesCache(userId?: string): void {
  if (userId) {
    userPreferencesCache.delete(userId);
  } else {
    userPreferencesCache.clear();
  }
}

/**
 * Lightweight authentication check that only fetches minimal user data.
 * This is much faster than getComprehensiveUserData() and should be used
 * for early auth checks before fetching full user details.
 *
 * @returns Lightweight user auth data or null if not authenticated
 */
export const getLightweightUserAuth = cache(async (): Promise<LightweightUserAuth | null> => {
  try {
    const reqHeaders = await headers();

    const session = await auth.api.getSession({
      headers: reqHeaders,
    });

    if (!session?.user?.id) {
      return null;
    }

    const userId = session.user.id;

    const cached = getCachedLightweightAuth(userId);
    if (cached) {
      return cached;
    }

    const fullCached = getCachedUserData(userId);
    if (fullCached) {
      const lightweightData: LightweightUserAuth = {
        userId: fullCached.id,
        email: fullCached.email,
      };
      setCachedLightweightAuth(userId, lightweightData);
      return lightweightData;
    }

    const [row] = await maindb.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);

    if (!row) {
      return null; // user not found in DB
    }

    const lightweightData: LightweightUserAuth = {
      userId,
      email: row.email,
    };

    setCachedLightweightAuth(userId, lightweightData);

    return lightweightData;
  } catch (error) {
    log.error('Error in lightweight auth check:', error);
    return null;
  }
});

export const getComprehensiveUserData = cache(async (): Promise<ComprehensiveUserData | null> => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return null;
    }

    const userId = session.user.id;

    const cached = getCachedUserData(userId);
    if (cached) {
      return cached;
    }

    const [row] = await maindb
      .select({
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        name: user.name,
        image: user.image,
        userCreatedAt: user.createdAt,
        userUpdatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!row) {
      return null;
    }

    const comprehensiveData: ComprehensiveUserData = {
      id: row.userId,
      email: row.email,
      emailVerified: row.emailVerified,
      twoFactorEnabled: row.twoFactorEnabled,
      name: row.name || row.email.split('@')[0], // Fallback to email prefix if name is null
      image: row.image,
      createdAt: row.userCreatedAt,
      updatedAt: row.userUpdatedAt,
    };

    setCachedUserData(userId, comprehensiveData);

    return comprehensiveData;
  } catch (error) {
    log.error('Error getting comprehensive user data:', error);
    return null;
  }
});
