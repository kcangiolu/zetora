'use server';

import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { getUser } from '@/lib/auth-utils';
import { hasVisionSupport, zetora, resolveModel } from '@/ai/providers';
import {
  getCustomInstructionsByUserId,
  createCustomInstructions,
  updateCustomInstructions,
  deleteCustomInstructions,
  upsertUserPreferences,
} from '@/lib/db/queries';
import { db, maindb } from '@/lib/db';
import { type User } from '@/lib/db/schema';
import { eq, desc, ilike, and, asc, inArray, notExists } from 'drizzle-orm';
import { sendLookoutCompletionEmail } from '@/lib/email';
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
import { getCachedUserPreferencesByUserId, clearUserPreferencesCache } from '@/lib/user-data-server';
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

// Custom Instructions Server Actions
export async function getCustomInstructions(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return null;
    }

    const instructions = await getCustomInstructionsByUserId({ userId: user.id });
    return instructions ?? null;
  } catch (error) {
    console.error('Error getting custom instructions:', error);
    return null;
  }
}

export async function saveCustomInstructions(content: string) {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!content.trim()) {
      return { success: false, error: 'Content cannot be empty' };
    }

    // Check if instructions already exist
    const existingInstructions = await getCustomInstructionsByUserId({ userId: user.id });

    let result;
    if (existingInstructions) {
      result = await updateCustomInstructions({ userId: user.id, content: content.trim() });
    } else {
      result = await createCustomInstructions({ userId: user.id, content: content.trim() });
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('Error saving custom instructions:', error);
    return { success: false, error: 'Failed to save custom instructions' };
  }
}

export async function deleteCustomInstructionsAction() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const result = await deleteCustomInstructions({ userId: user.id });
    return { success: true, data: result };
  } catch (error) {
    console.error('Error deleting custom instructions:', error);
    return { success: false, error: 'Failed to delete custom instructions' };
  }
}

// User Preferences Actions
export async function getUserPreferences(providedUser?: User | null) {
  'use server';

  try {
    const user = providedUser || (await getUser());
    if (!user) {
      return null;
    }

    const preferences = await getCachedUserPreferencesByUserId(user.id);
    return preferences;
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return null;
  }
}

export async function saveUserPreferences(
  preferences: Partial<{
    'zetora-search-provider'?: 'exa' | 'parallel' | 'firecrawl';
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
    'zetora-anonymization-enabled'?: boolean;
    'zetora-anonymization-custom-terms'?: string[];
    'zetora-anonymization-fail-open'?: boolean;
    'zetora-tertiary-chat-title-model'?: string;
    'zetora-tertiary-chat-title-provider'?: string;
    'zetora-tertiary-followup-model'?: string;
    'zetora-tertiary-followup-provider'?: string;
    'zetora-tertiary-enhance-model'?: string;
    'zetora-tertiary-enhance-provider'?: string;
    'zetora-tertiary-tool-repair-model'?: string;
    'zetora-tertiary-tool-repair-provider'?: string;
    'zetora-tertiary-auto-router-model'?: string;
    'zetora-tertiary-auto-router-provider'?: string;
    'zetora-tertiary-translate-text-model'?: string;
    'zetora-tertiary-translate-text-provider'?: string;
    'zetora-tertiary-translate-vision-model'?: string;
    'zetora-tertiary-translate-vision-provider'?: string;
    'zetora-tertiary-lang-detect-model'?: string;
    'zetora-tertiary-lang-detect-provider'?: string;
    'zetora-tertiary-extreme-planner-model'?: string;
    'zetora-tertiary-extreme-planner-provider'?: string;
    'zetora-tts-provider'?: 'elevenlabs' | 'openai-compatible';
    'zetora-tts-custom-provider-id'?: string;
    'zetora-tts-openai-model'?: string;
    'zetora-tts-openai-voice'?: string;
    'zetora-tts-openai-language'?: string;
    'zetora-stt-provider'?: 'elevenlabs' | 'openai-compatible';
    'zetora-stt-custom-provider-id'?: string;
    'zetora-stt-openai-model'?: string;
  }>,
) {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const result = await upsertUserPreferences({ userId: user.id, preferences });

    // Clear cache after update
    clearUserPreferencesCache(user.id);

    return { success: true, data: result };
  } catch (error) {
    console.error('Error saving user preferences:', error);
    return { success: false, error: 'Failed to save user preferences' };
  }
}

export async function testEmailDelivery() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    if (!user.email) {
      return { success: false, error: 'No email address associated with your account' };
    }

    const prefs = await getCachedUserPreferencesByUserId(user.id).catch(() => null);
    const emailProvider = (prefs?.preferences as Record<string, string>)?.['zetora-email-provider'] as
      | 'resend'
      | 'smtp'
      | undefined;

    const result = await sendLookoutCompletionEmail({
      to: user.email,
      chatTitle: 'Test Email',
      assistantResponse: 'This is a test email from Zetora. Your email provider is configured correctly.',
      chatId: 'test',
      emailProvider,
    });

    if (result.success) {
      return { success: true, provider: emailProvider || 'auto-detected' };
    }
    return { success: false, error: result.error || 'Unknown error' };
  } catch (error) {
    console.error('Error testing email delivery:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test email',
    };
  }
}

export async function syncUserPreferences() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // This will be called from the client to migrate localStorage data
    // The actual migration logic will be in the hook
    return { success: true };
  } catch (error) {
    console.error('Error syncing user preferences:', error);
    return { success: false, error: 'Failed to sync user preferences' };
  }
}

// Fast pro user status check - UNIFIED VERSION
