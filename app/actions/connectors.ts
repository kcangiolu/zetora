'use server';

import { getCurrentUser } from './user';

import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { hasVisionSupport, zetora, resolveModel } from '@/ai/providers';
import {
  getChatsByUserId,
  getRecentChatsByUserId,
  deleteChatById,
  updateChatVisibilityById,
  getChatById,
  getMessageById,
  deleteMessagesByChatIdAfterTimestamp,
  updateChatTitleById,
  updateChatPinnedById,
  getExtremeSearchCount,
  incrementMessageUsage,
  incrementAnthropicUsage,
  incrementGoogleUsage,
  getMessageCount,
  getAnthropicUsageCount,
  getGoogleUsageCount,
  getAgentModeRequestCountForCurrentMonth,
  getHistoricalUsageData,
  getCustomInstructionsByUserId,
  createCustomInstructions,
  updateCustomInstructions,
  deleteCustomInstructions,
  upsertUserPreferences,
  getDodoSubscriptionsByUserId,
  createLookout,
  getLookoutsByUserId,
  getLookoutById,
  updateLookout,
  updateLookoutStatus,
  deleteLookout,
  getChatWithUserById,
} from '@/lib/db/queries';
import { db, maindb } from '@/lib/db';
import { chat, message, buildSession, dodosubscription, type User } from '@/lib/db/schema';
import { eq, desc, ilike, and, asc, inArray, notExists } from 'drizzle-orm';
import { get } from '@vercel/edge-config';
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

// Connector management actions
export async function createConnectorAction(provider: ConnectorProvider) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const authLink = await createConnection(provider, user.id);
    return { success: true, authLink };
  } catch (error) {
    console.error('Error creating connector:', error);
    return { success: false, error: 'Failed to create connector' };
  }
}

export async function listUserConnectorsAction() {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required', connections: [] };
    }

    const connections = await listUserConnections(user.id);
    return { success: true, connections };
  } catch (error) {
    console.error('Error listing connectors:', error);
    return { success: false, error: 'Failed to list connectors', connections: [] };
  }
}

export async function deleteConnectorAction(connectionId: string) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await deleteConnection(connectionId);
    if (result) {
      return { success: true };
    } else {
      return { success: false, error: 'Failed to delete connector' };
    }
  } catch (error) {
    console.error('Error deleting connector:', error);
    return { success: false, error: 'Failed to delete connector' };
  }
}

export async function manualSyncConnectorAction(provider: ConnectorProvider) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await manualSync(provider, user.id);
    if (result) {
      return { success: true };
    } else {
      return { success: false, error: 'Failed to start sync' };
    }
  } catch (error) {
    console.error('Error syncing connector:', error);
    return { success: false, error: 'Failed to start sync' };
  }
}

export async function getConnectorSyncStatusAction(provider: ConnectorProvider) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required', status: null };
    }

    const status = await getSyncStatus(provider, user.id);
    return { success: true, status };
  } catch (error) {
    console.error('Error getting sync status:', error);
    return { success: false, error: 'Failed to get sync status', status: null };
  }
}

// Server action to get supported student domains from Edge Config
export async function getStudentDomainsAction() {
  'use server';

  try {
    const studentDomainsConfig = await get('student_domains');
    if (studentDomainsConfig && typeof studentDomainsConfig === 'string') {
      // Parse CSV string to array, trim whitespace, and sort alphabetically
      const domains = studentDomainsConfig
        .split(',')
        .map((domain) => domain.trim())
        .filter((domain) => domain.length > 0)
        .sort();

      return {
        success: true,
        domains,
        count: domains.length,
      };
    }

    // Fallback to hardcoded domains if Edge Config fails
    const fallbackDomains = ['.edu', '.ac.in'].sort();
    return {
      success: true,
      domains: fallbackDomains,
      count: fallbackDomains.length,
      fallback: true,
    };
  } catch (error) {
    console.error('Failed to fetch student domains from Edge Config:', error);

    // Return fallback domains on error
    const fallbackDomains = ['.edu', '.ac.in'].sort();
    return {
      success: false,
      domains: fallbackDomains,
      count: fallbackDomains.length,
      fallback: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Fetch chats for the authenticated user (paginated)
