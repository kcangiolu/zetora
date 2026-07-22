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
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
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

import { createLogger } from '@/lib/logger';

const log = createLogger('actions-preferences');

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
    log.error('Error getting custom instructions:', error);
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
    log.error('Error saving custom instructions:', error);
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
    log.error('Error deleting custom instructions:', error);
    return { success: false, error: 'Failed to delete custom instructions' };
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
    log.error('Error testing email delivery:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test email',
    };
  }
}
