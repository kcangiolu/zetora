import { eq } from 'drizzle-orm';
import { all } from 'better-all';
import { v7 as uuidv7 } from 'uuid';
import type { ModelMessage } from 'ai';

import { getBetterAllOptions } from '@/lib/better-all';
import { maindb } from '@/lib/db';
import {
  createStreamId,
  incrementMessageUsage,
  updateChatTitleById,
  updateLookout,
  updateLookoutLastRun,
} from '@/lib/db/queries';
import { chat as chatTable, message as messageTable } from '@/lib/db/schema';
import { sendLookoutCompletionEmail } from '@/lib/email';
import { createLogger } from '@/lib/logger';
import { generateTitleFromUserMessage } from '@/lib/search/chat-title';
import type { ChatMessage } from '@/lib/types';

import { nextCronRun } from './schedule';
import { truncateMarkdown } from './truncate-markdown';

const log = createLogger('lookout');

// Characters of the answer the completion email shows.
const EMAIL_EXCERPT_LENGTH = 2000;

interface LookoutRow {
  id: string;
  title: string;
  prompt: string;
  frequency: string;
  cronSchedule: string;
  timezone: string;
}

// The chat a run writes to, with the lookout's prompt as its user message. Each
// write is read back: the stream's messages reference them.
export async function startLookoutRun(lookout: LookoutRow, userId: string, modelId: string) {
  const chatId = uuidv7();
  const streamId = 'stream-' + uuidv7();

  await maindb.insert(chatTable).values({
    id: chatId,
    createdAt: new Date(),
    userId,
    title: `Scheduled: ${lookout.title}`,
    visibility: 'private',
  });
  if (!(await maindb.query.chat.findFirst({ where: eq(chatTable.id, chatId) }))) {
    throw new Error(`Failed to persist lookout chat (chatId=${chatId})`);
  }

  const userMessage: ChatMessage = { id: uuidv7(), role: 'user', parts: [{ type: 'text', text: lookout.prompt }] };
  await maindb
    .insert(messageTable)
    .values([
      {
        chatId,
        id: userMessage.id,
        role: 'user',
        parts: userMessage.parts,
        attachments: [],
        createdAt: new Date(),
        model: modelId,
        completionTime: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    ])
    .onConflictDoNothing({ target: messageTable.id });

  await all(
    {
      async verifyMessage() {
        if (!(await maindb.query.message.findFirst({ where: eq(messageTable.id, userMessage.id) }))) {
          throw new Error(`Failed to persist lookout user message (messageId=${userMessage.id}, chatId=${chatId})`);
        }
      },
      async createStream() {
        await createStreamId({ streamId, chatId });
      },
    },
    getBetterAllOptions(),
  );

  return { chatId, streamId, userMessage };
}

// Saves the messages a run streamed.
export async function saveLookoutMessages(chatId: string, modelId: string, messages: ChatMessage[]) {
  if (messages.length === 0) return;
  await maindb
    .insert(messageTable)
    .values(
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts,
        createdAt: typeof message.metadata?.createdAt === 'string' ? new Date(message.metadata.createdAt) : new Date(),
        attachments: [],
        chatId,
        model: modelId,
        completionTime: message.metadata?.completionTime ?? 0,
        inputTokens: message.metadata?.inputTokens ?? 0,
        outputTokens: message.metadata?.outputTokens ?? 0,
        totalTokens: message.metadata?.totalTokens ?? 0,
      })),
    )
    .onConflictDoNothing({ target: messageTable.id });
}

// A recurring lookout's next run time, kept for the UI.
async function updateNextRunAt(lookout: LookoutRow): Promise<void> {
  if (lookout.frequency === 'once' || !lookout.cronSchedule) return;
  try {
    await updateLookout({ id: lookout.id, nextRunAt: nextCronRun(lookout.cronSchedule, lookout.timezone) });
  } catch (error) {
    log.error('Error calculating next run time:', error);
  }
}

// The answer's text, from the final text or, when that is empty, from the assistant
// messages of the response.
export function getResponseText(text: string, responseMessages: ModelMessage[]): string {
  if (text.trim()) return text;
  return responseMessages
    .filter((message) => message.role === 'assistant')
    .map((message) =>
      typeof message.content === 'string'
        ? message.content
        : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
    )
    .join('\n');
}

// After a successful run: usage, the run's metrics, the next run time, the chat's
// title and the completion email.
export async function recordLookoutSuccess({
  lookout,
  user,
  chatId,
  userMessage,
  durationMs,
  tokensUsed,
  toolCalls,
  responseText,
}: {
  lookout: LookoutRow;
  user: { id: string; email: string | null };
  chatId: string;
  userMessage: ChatMessage;
  durationMs: number;
  tokensUsed: number | undefined;
  toolCalls: number;
  responseText: string;
}) {
  await incrementMessageUsage({ userId: user.id });

  await updateLookoutLastRun({
    id: lookout.id,
    lastRunAt: new Date(),
    lastRunChatId: chatId,
    runStatus: 'success',
    duration: durationMs,
    tokensUsed,
    // Calls to any tool, under the column's historical name.
    searchesPerformed: toolCalls,
  });
  await updateNextRunAt(lookout);

  // The chat keeps the lookout's title when no title can be generated.
  let title = lookout.title;
  try {
    title = await generateTitleFromUserMessage({ message: userMessage, userId: user.id });
    await updateChatTitleById({ chatId, title: `Scheduled: ${title}` });
  } catch (titleError) {
    log.error('Failed to title the lookout chat:', titleError);
  }

  if (user.email) {
    try {
      await sendLookoutCompletionEmail({
        to: user.email,
        chatTitle: title,
        assistantResponse: truncateMarkdown(responseText.trim() || 'No response available.', EMAIL_EXCERPT_LENGTH),
        chatId,
      });
    } catch (emailError) {
      log.error('Failed to send completion email:', emailError);
    }
  }
}

// After a failed or timed-out run: the error on the run's record.
export async function recordLookoutFailure({
  lookoutId,
  chatId,
  durationMs,
  error,
  timedOut = false,
}: {
  lookoutId: string;
  chatId: string;
  durationMs: number;
  error: unknown;
  timedOut?: boolean;
}) {
  try {
    await updateLookoutLastRun({
      id: lookoutId,
      lastRunAt: new Date(),
      lastRunChatId: chatId,
      runStatus: timedOut ? 'timeout' : 'error',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error occurred'),
      duration: durationMs,
    });
  } catch (updateError) {
    log.error('Failed to update lookout with error info:', updateError);
  }
}
