'use server';

import { getCurrentUser } from './user';
import { generateTitleFromUserMessage } from '@/lib/search/chat-title';

import { UIMessage } from 'ai';
import type { ModelMessage } from 'ai';
import { getUser } from '@/lib/auth-utils';
import { hasVisionSupport, zetora, resolveModel } from '@/ai/providers';
import {
  getChatsByUserId,
  getRecentChatsByUserId,
  deleteChatById,
  updateChatVisibilityById,
  getChatById,
  getChatByIdForValidation,
  getMessageById,
  deleteMessagesByChatIdAfterTimestamp,
  updateChatTitleById,
  updateChatPinnedById,
} from '@/lib/db/queries';
import { db } from '@/lib/db';
import { chat, message, buildSession } from '@/lib/db/schema';
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
import { v7 as uuidv7 } from 'uuid';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

// Lightweight function for sidebar recent chats - minimal payload, no cursor pagination
export async function getRecentChats(
  userId: string,
  limit: number = 8,
): Promise<{
  chats: Array<{
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    isPinned: boolean;
    visibility: 'public' | 'private';
  }>;
  hasMore: boolean;
}> {
  'use server';

  if (!userId) return { chats: [], hasMore: false };

  try {
    return await getRecentChatsByUserId({ userId, limit });
  } catch (error) {
    console.error('Error fetching recent chats:', error);
    return { chats: [], hasMore: false };
  }
}

// Add functions to fetch user chats
export async function getUserChats(
  userId: string,
  limit: number = 20,
  startingAfter?: string,
  endingBefore?: string,
): Promise<{ chats: any[]; hasMore: boolean }> {
  'use server';

  if (!userId) return { chats: [], hasMore: false };

  try {
    return await getChatsByUserId({
      id: userId,
      limit,
      startingAfter: startingAfter || null,
      endingBefore: endingBefore || null,
    });
  } catch (error) {
    console.error('Error fetching user chats:', error);
    return { chats: [], hasMore: false };
  }
}

// Add function to load more chats for infinite scroll
// Accepts optional cursorDate to skip the extra DB lookup for the cursor chat's updatedAt
export async function loadMoreChats(
  userId: string,
  lastChatId: string,
  limit: number = 20,
  cursorDate?: string,
  cursorIsPinned?: boolean,
): Promise<{ chats: any[]; hasMore: boolean }> {
  'use server';

  if (!userId || !lastChatId) return { chats: [], hasMore: false };

  try {
    return await getChatsByUserId({
      id: userId,
      limit,
      startingAfter: null,
      endingBefore: lastChatId,
      cursorDate: cursorDate || null,
      cursorIsPinned: cursorIsPinned ?? null,
    });
  } catch (error) {
    console.error('Error loading more chats:', error);
    return { chats: [], hasMore: false };
  }
}

// Add function to delete a chat
export async function deleteChat(chatId: string) {
  'use server';

  if (!chatId) return null;

  try {
    return await deleteChatById({ id: chatId });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return null;
  }
}

// Add function to bulk delete chats
export async function bulkDeleteChats(chatIds: string[]) {
  'use server';

  if (!chatIds || chatIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  try {
    const taskEntries = chatIds.map((id) => [`chat:${id}`, async () => deleteChatById({ id })] as const);

    const settled = await allSettled(Object.fromEntries(taskEntries), getBetterAllOptions());

    const settledValues = Object.values(settled);
    const anyRejected = settledValues.some((r) => r.status === 'rejected');
    if (anyRejected) {
      // Preserve previous behavior: bubble up failure
      throw new Error('Failed to delete chats');
    }

    const deletedCount = settledValues.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
    return { success: true, deletedCount };
  } catch (error) {
    console.error('Error bulk deleting chats:', error);
    throw new Error('Failed to delete chats');
  }
}

// Add function to update chat visibility
export async function updateChatVisibility(chatId: string, visibility: 'private' | 'public') {
  'use server';

  console.log('🔄 updateChatVisibility called with:', { chatId, visibility });

  if (!chatId) {
    console.error('❌ updateChatVisibility: No chatId provided');
    throw new Error('Chat ID is required');
  }

  try {
    console.log('📡 Calling updateChatVisibilityById with:', { chatId, visibility });
    const result = await updateChatVisibilityById({ chatId, visibility });
    console.log('✅ updateChatVisibilityById successful, result:', result);

    // Return a serializable plain object instead of raw database result
    return {
      success: true,
      chatId,
      visibility,
      rowCount: result?.rowCount || 0,
    };
  } catch (error) {
    console.error('❌ Error in updateChatVisibility:', {
      chatId,
      visibility,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

export async function updateChatPinned(chatId: string, isPinned: boolean) {
  'use server';

  if (!chatId) return null;

  try {
    return await updateChatPinnedById({ chatId, isPinned });
  } catch (error) {
    console.error('Error updating chat pinned state:', error);
    return null;
  }
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  'use server';
  try {
    const user = await getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const [message] = await getMessageById({ id });

    if (!message) {
      console.error(`No message found with id: ${id}`);
      return;
    }

    const owningChat = await getChatByIdForValidation({ id: message.chatId });
    if (!owningChat || owningChat.userId !== user.id) {
      throw new Error('Unauthorized');
    }

    await deleteMessagesByChatIdAfterTimestamp({
      chatId: message.chatId,
      timestamp: message.createdAt,
    });

    console.log(`Successfully deleted trailing messages after message ID: ${id}`);
  } catch (error) {
    console.error(`Error deleting trailing messages: ${error}`);
    throw error; // Re-throw to allow caller to handle
  }
}

// Add function to update chat title
export async function updateChatTitle(chatId: string, title: string) {
  'use server';

  if (!chatId || !title.trim()) return null;

  try {
    return await updateChatTitleById({ chatId, title: title.trim() });
  } catch (error) {
    console.error('Error updating chat title:', error);
    return null;
  }
}

export async function forkChat(
  originalChatId: string,
): Promise<{ success: boolean; newChatId?: string; error?: string }> {
  'use server';

  if (!originalChatId) {
    return { success: false, error: 'Chat ID is required' };
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    const originalChat = await getChatById({ id: originalChatId });
    if (!originalChat || originalChat.visibility !== 'public') {
      return { success: false, error: 'Chat is not available for forking' };
    }

    const messages = await db.query.message.findMany({
      where: eq(message.chatId, originalChatId),
      orderBy: (fields, { asc }) => [asc(fields.createdAt), asc(fields.id)],
    });

    const newChatId = uuidv7();
    const newChatTitle = originalChat.title ? `Fork of ${originalChat.title}` : 'Forked Chat';

    const messagesToSave = messages.map((messageItem) => ({
      chatId: newChatId,
      id: uuidv7(),
      role: messageItem.role,
      parts: messageItem.parts,
      attachments: messageItem.attachments ?? [],
      createdAt: messageItem.createdAt,
      model: messageItem.model ?? null,
      inputTokens: messageItem.inputTokens ?? null,
      outputTokens: messageItem.outputTokens ?? null,
      totalTokens: messageItem.totalTokens ?? null,
      completionTime: messageItem.completionTime ?? null,
    }));

    await all(
      {
        async saveMessages() {
          if (messagesToSave.length > 0) {
            await saveMessages({ messages: messagesToSave });
          }
          return true;
        },
        async saveChat() {
          await saveChat({
            id: newChatId,
            userId: currentUser.id,
            title: newChatTitle,
            visibility: 'private',
          });
          return true;
        },
      },
      getBetterAllOptions(),
    );

    return { success: true, newChatId };
  } catch (error) {
    console.error('Error forking chat:', error);
    return { success: false, error: 'Failed to fork chat' };
  }
}

// Branch out a chat - create a new chat with the current user and assistant message pair
export async function branchOutChat({
  userMessage,
  assistantMessage,
}: {
  userMessage: UIMessage;
  assistantMessage: UIMessage;
}) {
  'use server';

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    // Generate new chat ID and message IDs
    const newChatId = uuidv7();
    const newUserMessageId = uuidv7();
    const newAssistantMessageId = uuidv7();

    // Start title generation early (can run while we prepare messages)
    const chatTitlePromise = generateTitleFromUserMessage({ message: userMessage });

    // Prepare messages for saving
    const messagesToSave = [
      {
        chatId: newChatId,
        id: newUserMessageId,
        role: 'user' as const,
        parts: userMessage.parts,
        attachments: (userMessage as any).experimental_attachments ?? [],
        createdAt: new Date(),
        model: (userMessage as any).metadata?.model || null,
        inputTokens: (userMessage as any).metadata?.inputTokens ?? null,
        outputTokens: null,
        totalTokens: null,
        completionTime: null,
      },
      {
        chatId: newChatId,
        id: newAssistantMessageId,
        role: 'assistant' as const,
        parts: assistantMessage.parts,
        attachments: [],
        createdAt: new Date(),
        model: (assistantMessage as any).metadata?.model || null,
        inputTokens: (assistantMessage as any).metadata?.inputTokens ?? null,
        outputTokens: (assistantMessage as any).metadata?.outputTokens ?? null,
        totalTokens: (assistantMessage as any).metadata?.totalTokens ?? null,
        completionTime: (assistantMessage as any).metadata?.completionTime ?? null,
      },
    ];

    // Create chat first (messages have foreign key to chat), then save messages
    await all(
      {
        chatTitle: async function () {
          return chatTitlePromise;
        },
        saveChat: async function () {
          const chatTitle = await this.$.chatTitle;
          await saveChat({
            id: newChatId,
            userId: currentUser.id,
            title: chatTitle,
            visibility: 'private',
          });
          return true;
        },
        saveMessages: async function () {
          await this.$.saveChat; // Wait for chat to be created first (foreign key constraint)
          await saveMessages({ messages: messagesToSave });
          return true;
        },
      },
      getBetterAllOptions(),
    );

    return { success: true, chatId: newChatId };
  } catch (error) {
    console.error('Error branching out chat:', error);
    return { success: false, error: 'Failed to branch out chat' };
  }
}

// Fetch chats for the authenticated user (paginated)
interface ChatMeta {
  preview?: string;
  model?: string;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/`[^`]*`/g, '') // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → label only
    .replace(/#{1,6}\s+/g, '') // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .replace(/^[-*+]\s+/gm, '') // unordered list bullets
    .replace(/^\d+\.\s+/gm, '') // ordered list numbers
    .replace(/^>\s+/gm, '') // blockquotes
    .replace(
      /^\|(.+)\|$/gm,
      (
        _,
        row, // table rows → space-separated cells
      ) =>
        row
          .split('|')
          .map((c: string) => c.trim())
          .filter(Boolean)
          .join(' '),
    )
    .replace(/^\|?[\s:|-]+\|[\s:|-|]*$/gm, '') // table separator rows (---|:---:|---)
    .replace(/[-]{3,}|[*]{3,}|[_]{3,}/g, '') // horizontal rules
    .replace(/\n{2,}/g, ' ') // collapse blank lines
    .replace(/\n/g, ' ') // newlines → space
    .replace(/\s{2,}/g, ' ') // collapse whitespace
    .trim();
}

// Batch-fetch the first user message (preview) + first assistant message (model) per chat.
// Two queries total, no N+1.
async function buildPreviewMap(chatIds: string[]): Promise<Record<string, ChatMeta>> {
  if (chatIds.length === 0) return {};

  const rows = await db
    .select({ chatId: message.chatId, role: message.role, parts: message.parts, model: message.model })
    .from(message)
    .where(and(inArray(message.chatId, chatIds)))
    .orderBy(asc(message.createdAt));

  const seenUser = new Set<string>();
  const seenAssistant = new Set<string>();
  const map: Record<string, ChatMeta> = {};

  for (const msg of rows) {
    if (!map[msg.chatId]) map[msg.chatId] = {};

    if (msg.role === 'assistant' && !seenAssistant.has(msg.chatId)) {
      seenAssistant.add(msg.chatId);
      if (msg.model) map[msg.chatId].model = msg.model;
      const parts = Array.isArray(msg.parts) ? msg.parts : [];
      const raw = (parts as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text!.trim())
        .join(' ');
      const text = stripMarkdown(raw);
      if (text) map[msg.chatId].preview = text.length > 160 ? text.slice(0, 160) + '…' : text;
    }

    // Fallback: if no assistant message yet, use first user message
    if (msg.role === 'user' && !seenUser.has(msg.chatId) && !map[msg.chatId].preview) {
      seenUser.add(msg.chatId);
      const parts = Array.isArray(msg.parts) ? msg.parts : [];
      const raw = (parts as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text!.trim())
        .join(' ');
      const text = stripMarkdown(raw);
      if (text) map[msg.chatId].preview = text.length > 160 ? text.slice(0, 160) + '…' : text;
    }
  }

  return map;
}

export async function getAllChatsWithPreview(limit: number = 25, offset: number = 0) {
  'use server';

  try {
    const user = await getUser();

    if (!user) {
      return { error: 'Unauthorized', status: 401 };
    }

    const chats = await db.query.chat.findMany({
      where: and(
        eq(chat.userId, user.id),
        notExists(db.select({ id: buildSession.id }).from(buildSession).where(eq(buildSession.chatId, chat.id))),
      ),
      orderBy: [desc(chat.isPinned), desc(chat.updatedAt), desc(chat.id)],
      limit,
      offset,
    });

    const previewMap = await buildPreviewMap(chats.map((c) => c.id));
    const chatsWithPreview = chats.map((c) => ({
      ...c,
      preview: previewMap[c.id]?.preview ?? null,
      model: previewMap[c.id]?.model ?? null,
    }));

    return { chats: chatsWithPreview };
  } catch (error) {
    console.error('Error fetching chats:', error);
    return { error: 'Failed to fetch chats', status: 500 };
  }
}

// Search chats by title (paginated)
export async function searchChatsByTitle(query: string, limit: number = 25, offset: number = 0) {
  'use server';

  try {
    const user = await getUser();

    if (!user) {
      return { error: 'Unauthorized', status: 401 };
    }

    const trimmedQuery = query?.trim() || '';

    const excludeBuildChats = notExists(
      db.select({ id: buildSession.id }).from(buildSession).where(eq(buildSession.chatId, chat.id)),
    );

    const chats = await db.query.chat.findMany({
      where:
        trimmedQuery.length === 0
          ? and(eq(chat.userId, user.id), excludeBuildChats)
          : and(eq(chat.userId, user.id), ilike(chat.title, `%${trimmedQuery}%`), excludeBuildChats),
      orderBy: [desc(chat.isPinned), desc(chat.updatedAt), desc(chat.id)],
      limit,
      offset,
    });

    const previewMap = await buildPreviewMap(chats.map((c) => c.id));
    const chatsWithPreview = chats.map((c) => ({
      ...c,
      preview: previewMap[c.id]?.preview ?? null,
      model: previewMap[c.id]?.model ?? null,
    }));

    return { chats: chatsWithPreview };
  } catch (error) {
    console.error('Error searching chats:', error);
    return { error: 'Failed to search chats', status: 500 };
  }
}
