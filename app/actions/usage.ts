'use server';

import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { getUser } from '@/lib/auth-utils';
import { hasVisionSupport, zetora, resolveModel } from '@/ai/providers';
import {
  getExtremeSearchCount,
  incrementMessageUsage,
  incrementAnthropicUsage,
  incrementGoogleUsage,
  getMessageCount,
  getAnthropicUsageCount,
  getGoogleUsageCount,
  getAgentModeRequestCountForCurrentMonth,
  getHistoricalUsageData,
} from '@/lib/db/queries';
import { db, maindb } from '@/lib/db';
import { type User } from '@/lib/db/schema';
import { eq, desc, ilike, and, asc, inArray, notExists } from 'drizzle-orm';
import { GroqProviderOptions, groq } from '@ai-sdk/groq';
import {
  createBullMqSchedule,
  scheduleBullMqOnce,
  deleteBullMqSchedule,
  pauseBullMqSchedule,
  resumeBullMqSchedule,
  getLockoutProvider,
} from '@/lib/services/bullmq';
import type { CharacterAlignmentResponseModel } from '@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel';
import {
  usageCountCache,
  createMessageCountKey,
  createExtremeCountKey,
  createAnthropicCountKey,
  createGoogleCountKey,
  createAgentModeCountKey,
} from '@/lib/performance-cache';
import {
  getComprehensiveUserData,
  getLightweightUserAuth,
  getCachedUserPreferencesByUserId,
  clearUserPreferencesCache,
} from '@/lib/user-data-server';
import {
  createConnection,
  listUserConnections,
  deleteConnection,
  manualSync,
  getSyncStatus,
  type ConnectorProvider,
} from '@/lib/connectors';
import { lookoutCallbackHeaders, lookoutQstashHeaders } from '@/lib/lookout-auth';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';

export async function getUserMessageCount(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return { count: 0, error: 'User not found' };
    }

    // Check cache first
    const cacheKey = createMessageCountKey(user.id);
    const cached = usageCountCache.get(cacheKey);
    if (cached !== null) {
      console.log('⏱️ [USAGE] getUserMessageCount: cache hit');
      return { count: cached, error: null };
    }

    const start = Date.now();
    const count = await getMessageCount({
      userId: user.id,
    });
    const durationMs = Date.now() - start;
    console.log(`⏱️ [USAGE] getUserMessageCount: DB usage lookup took ${durationMs}ms`);

    // Cache the result
    usageCountCache.set(cacheKey, count);

    return { count, error: null };
  } catch (error) {
    console.error('Error getting user message count:', error);
    return { count: 0, error: 'Failed to get message count' };
  }
}

export async function getUserExtremeSearchCount(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return { count: 0, error: 'User not found' };
    }

    // Check cache first
    const cacheKey = createExtremeCountKey(user.id);
    const cached = usageCountCache.get(cacheKey);
    if (cached !== null) {
      console.log('⏱️ [USAGE] getUserExtremeSearchCount: cache hit');
      return { count: cached, error: null };
    }

    const start = Date.now();
    const count = await getExtremeSearchCount({
      userId: user.id,
    });
    const durationMs = Date.now() - start;
    console.log(`⏱️ [USAGE] getUserExtremeSearchCount: DB usage lookup took ${durationMs}ms`);

    // Cache the result
    usageCountCache.set(cacheKey, count);

    return { count, error: null };
  } catch (error) {
    console.error('Error getting user extreme search count:', error);
    return { count: 0, error: 'Failed to get extreme search count' };
  }
}

export async function incrementUserMessageCount() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    await incrementMessageUsage({
      userId: user.id,
    });

    // Invalidate cache
    const cacheKey = createMessageCountKey(user.id);
    usageCountCache.delete(cacheKey);

    return { success: true, error: null };
  } catch (error) {
    console.error('Error incrementing user message count:', error);
    return { success: false, error: 'Failed to increment message count' };
  }
}

export async function getExtremeSearchUsageCount(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return { count: 0, error: 'User not found' };
    }

    // Check cache first
    const cacheKey = createExtremeCountKey(user.id);
    const cached = usageCountCache.get(cacheKey);
    if (cached !== null) {
      console.log('⏱️ [USAGE] getExtremeSearchUsageCount: cache hit');
      return { count: cached, error: null };
    }

    const start = Date.now();
    const count = await getExtremeSearchCount({
      userId: user.id,
    });
    const durationMs = Date.now() - start;
    console.log(`⏱️ [USAGE] getExtremeSearchUsageCount: DB usage lookup took ${durationMs}ms`);

    // Cache the result
    usageCountCache.set(cacheKey, count);

    return { count, error: null };
  } catch (error) {
    console.error('Error getting extreme search usage count:', error);
    return { count: 0, error: 'Failed to get extreme search count' };
  }
}

/**
 * Get message count by userId directly - avoids getUser() overhead.
 * Uses the same cache as getUserMessageCount for consistency.
 */
export async function getMessageCountByUserId(userId: string) {
  const cacheKey = createMessageCountKey(userId);
  const cached = usageCountCache.get(cacheKey);
  if (cached !== null) return { count: cached, error: null };

  const count = await getMessageCount({ userId });
  usageCountCache.set(cacheKey, count);
  return { count, error: null };
}

/**
 * Get extreme search count by userId directly - avoids getUser() overhead.
 * Uses the same cache as getExtremeSearchUsageCount for consistency.
 */
export async function getExtremeSearchCountByUserId(userId: string) {
  const cacheKey = createExtremeCountKey(userId);
  const cached = usageCountCache.get(cacheKey);
  if (cached !== null) return { count: cached, error: null };

  const count = await getExtremeSearchCount({ userId });
  usageCountCache.set(cacheKey, count);
  return { count, error: null };
}

/**
 * Get anthropic usage count by userId directly - avoids getUser() overhead.
 * Uses the same cache strategy as other usage counters for consistency.
 */
export async function getAnthropicUsageCountByUserId(userId: string) {
  const cacheKey = createAnthropicCountKey(userId);
  const cached = usageCountCache.get(cacheKey);
  if (cached !== null) return { count: cached, error: null };

  const count = await getAnthropicUsageCount({ userId });
  usageCountCache.set(cacheKey, count);
  return { count, error: null };
}

export async function getAnthropicUsageCountAction(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return { count: 0, error: 'User not found' };
    }

    const cacheKey = createAnthropicCountKey(user.id);
    const cached = usageCountCache.get(cacheKey);
    if (cached !== null) {
      console.log('⏱️ [USAGE] getAnthropicUsageCountAction: cache hit');
      return { count: cached, error: null };
    }

    const start = Date.now();
    const count = await getAnthropicUsageCount({
      userId: user.id,
    });
    const durationMs = Date.now() - start;
    console.log(`⏱️ [USAGE] getAnthropicUsageCountAction: DB usage lookup took ${durationMs}ms`);

    usageCountCache.set(cacheKey, count);

    return { count, error: null };
  } catch (error) {
    console.error('Error getting anthropic usage count:', error);
    return { count: 0, error: 'Failed to get anthropic usage count' };
  }
}

export async function getAgentModeUsageCountAction(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return { count: 0, error: 'User not found' };
    }

    const cacheKey = createAgentModeCountKey(user.id);
    const cached = usageCountCache.get(cacheKey);
    if (cached !== null) {
      console.log('⏱️ [USAGE] getAgentModeUsageCountAction: cache hit');
      return { count: cached, error: null };
    }

    const start = Date.now();
    const count = await getAgentModeRequestCountForCurrentMonth({
      userId: user.id,
    });
    const durationMs = Date.now() - start;
    console.log(`⏱️ [USAGE] getAgentModeUsageCountAction: DB usage lookup took ${durationMs}ms`);

    usageCountCache.set(cacheKey, count);

    return { count, error: null };
  } catch (error) {
    console.error('Error getting agent mode usage count:', error);
    return { count: 0, error: 'Failed to get agent mode usage count' };
  }
}

export async function incrementAnthropicUsageAction(model?: string | null) {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    await incrementAnthropicUsage({
      userId: user.id,
      model,
    });

    const cacheKey = createAnthropicCountKey(user.id);
    usageCountCache.delete(cacheKey);

    return { success: true, error: null };
  } catch (error) {
    console.error('Error incrementing anthropic usage count:', error);
    return { success: false, error: 'Failed to increment anthropic usage count' };
  }
}

export async function getGoogleUsageCountByUserId(userId: string) {
  const cacheKey = createGoogleCountKey(userId);
  const cached = usageCountCache.get(cacheKey);
  if (cached !== null) return { count: cached, error: null };

  const count = await getGoogleUsageCount({ userId });
  usageCountCache.set(cacheKey, count);
  return { count, error: null };
}

export async function getGoogleUsageCountAction(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return { count: 0, error: 'User not found' };
    }

    const cacheKey = createGoogleCountKey(user.id);
    const cached = usageCountCache.get(cacheKey);
    if (cached !== null) {
      console.log('⏱️ [USAGE] getGoogleUsageCountAction: cache hit');
      return { count: cached, error: null };
    }

    const start = Date.now();
    const count = await getGoogleUsageCount({ userId: user.id });
    const durationMs = Date.now() - start;
    console.log(`⏱️ [USAGE] getGoogleUsageCountAction: DB usage lookup took ${durationMs}ms`);

    usageCountCache.set(cacheKey, count);
    return { count, error: null };
  } catch (error) {
    console.error('Error getting google usage count:', error);
    return { count: 0, error: 'Failed to get google usage count' };
  }
}

export async function incrementGoogleUsageAction(model?: string | null) {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    await incrementGoogleUsage({ userId: user.id, model });

    const cacheKey = createGoogleCountKey(user.id);
    usageCountCache.delete(cacheKey);

    return { success: true, error: null };
  } catch (error) {
    console.error('Error incrementing google usage count:', error);
    return { success: false, error: 'Failed to increment google usage count' };
  }
}

export async function getHistoricalUsage(providedUser?: User | null, days: number = 30) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return [];
    }

    // Convert days to months for the database query (approximately 30 days per month)
    const months = Math.ceil(days / 30);
    const historicalData = await getHistoricalUsageData({ userId: user.id, months });

    // Use the exact number of days requested
    const totalDays = days;
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (totalDays - 1)); // -1 to include today

    // Create a map of existing data for quick lookup
    const dataMap = new Map<string, number>();
    historicalData.forEach((record) => {
      const dateKey = record.date.toISOString().split('T')[0];
      dataMap.set(dateKey, record.messageCount || 0);
    });

    // Generate complete dataset for all days
    const completeData = [];
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateKey = currentDate.toISOString().split('T')[0];

      const count = dataMap.get(dateKey) || 0;
      let level: 0 | 1 | 2 | 3 | 4;

      // Define usage levels based on message count
      if (count === 0) level = 0;
      else if (count <= 3) level = 1;
      else if (count <= 7) level = 2;
      else if (count <= 12) level = 3;
      else level = 4;

      completeData.push({
        date: dateKey,
        count,
        level,
      });
    }

    return completeData;
  } catch (error) {
    console.error('Error getting historical usage:', error);
    return [];
  }
}

// Custom Instructions Server Actions
