'use server';

import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { getUser } from '@/lib/auth-utils';
import {
  getCustomInstructionsByUserId,
  createCustomInstructions,
  updateCustomInstructions,
  deleteCustomInstructions,
} from '@/lib/db/queries';
import { db, maindb } from '@/lib/db';
import { eq, desc, ilike, and, asc, inArray, notExists } from 'drizzle-orm';
import { sendLookoutCompletionEmail } from '@/lib/email';
import { GroqProviderOptions, groq } from '@ai-sdk/groq';
import type { CharacterAlignmentResponseModel } from '@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel';
import { lookoutCallbackHeaders, lookoutQstashHeaders } from '@/lib/lookout-auth';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';

import { createLogger } from '@/lib/logger';
import { instructions as defaultSystemPromptInstructions } from '@/lib/search/groups/auto';

const log = createLogger('actions-preferences');

// Auto mode's built-in system prompt (lib/search/groups/auto.ts). Exposed to
// the client for reference/reset purposes only — `auto.ts` is `server-only`
// and can't be imported directly from the Settings UI.
export async function getDefaultSystemPrompt() {
  'use server';

  return defaultSystemPromptInstructions;
}

// Custom Instructions Server Actions
export async function getCustomInstructions() {
  'use server';

  try {
    const user = await getUser();
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

    await sendLookoutCompletionEmail({
      to: user.email,
      chatTitle: 'Test Email',
      assistantResponse: 'This is a test email from Zetora. Your email provider is configured correctly.',
      chatId: 'test',
    });
    return { success: true };
  } catch (error) {
    log.error('Error testing email delivery:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test email',
    };
  }
}
