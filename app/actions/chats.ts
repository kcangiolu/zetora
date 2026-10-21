'use server';

import { getCurrentUser } from './user';
import { generateTitleFromUserMessage } from '@/lib/search/chat-title';

import { getUser } from '@/lib/auth-utils';
import {
  getChatsByUserId,
  getRecentChatsByUserId,
  deleteChatById,
  updateChatVisibilityById,
  getChatById,
  getChatByIdForValidation,
  getMessageById,
  deleteMessagesByChatIdAfterTimestamp,
  updateMessagePartsById,
  updateChatTitleById,
  updateChatPinnedById,
  hideContextImage,
  unhideContextImage,
} from '@/lib/db/queries';
import { db } from '@/lib/db';
import { chat, message, buildSession, hermesConversation, type Message } from '@/lib/db/schema';
import type { ChatModeFilter } from '@/lib/hermes/chat-mode';
import type { ChatMessage } from '@/lib/types';
import { eq, desc, ilike, and, or, asc, inArray, notExists, exists, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

import { createLogger } from '@/lib/logger';
import { CHAT_TITLE_MAX_LENGTH } from '@/lib/constants';

const log = createLogger('chats');

// Lightweight function for sidebar recent chats - minimal payload, no cursor pagination
export async function getRecentChats(limit: number = 8): Promise<{
  chats: Array<{
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    isPinned: boolean;
    visibility: 'public' | 'private';
    isHermesChat: boolean;
  }>;
  hasMore: boolean;
}> {
  'use server';

  const user = await getUser();
  if (!user) return { chats: [], hasMore: false };

  try {
    return await getRecentChatsByUserId({ userId: user.id, limit });
  } catch (error) {
    log.error('Error fetching recent chats:', error);
    return { chats: [], hasMore: false };
  }
}

// Add functions to fetch user chats
export async function getUserChats(
  limit: number = 20,
  startingAfter?: string,
  endingBefore?: string,
): Promise<{ chats: any[]; hasMore: boolean }> {
  'use server';

  const user = await getUser();
  if (!user) return { chats: [], hasMore: false };

  try {
    return await getChatsByUserId({
      id: user.id,
      limit,
      startingAfter: startingAfter || null,
      endingBefore: endingBefore || null,
    });
  } catch (error) {
    log.error('Error fetching user chats:', error);
    return { chats: [], hasMore: false };
  }
}

// Add function to load more chats for infinite scroll
// Accepts optional cursorDate to skip the extra DB lookup for the cursor chat's updatedAt
export async function loadMoreChats(
  lastChatId: string,
  limit: number = 20,
  cursorDate?: string,
  cursorIsPinned?: boolean,
): Promise<{ chats: any[]; hasMore: boolean }> {
  'use server';

  if (!lastChatId) return { chats: [], hasMore: false };

  const user = await getUser();
  if (!user) return { chats: [], hasMore: false };

  try {
    return await getChatsByUserId({
      id: user.id,
      limit,
      startingAfter: null,
      endingBefore: lastChatId,
      cursorDate: cursorDate || null,
      cursorIsPinned: cursorIsPinned ?? null,
    });
  } catch (error) {
    log.error('Error loading more chats:', error);
    return { chats: [], hasMore: false };
  }
}

// Server actions are reachable by anyone who can POST to a page, so every
// chat mutation checks the session and the chat's owner first.
async function assertOwnsChat(chatId: string): Promise<void> {
  const user = await getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  const owningChat = await getChatByIdForValidation({ id: chatId });
  if (!owningChat || owningChat.userId !== user.id) {
    throw new Error('Unauthorized');
  }
}

// Add function to delete a chat
export async function deleteChat(chatId: string) {
  'use server';

  if (!chatId) return null;

  try {
    await assertOwnsChat(chatId);
    return await deleteChatById({ id: chatId });
  } catch (error) {
    log.error('Error deleting chat:', error);
    throw error;
  }
}

// Add function to bulk delete chats
export async function bulkDeleteChats(chatIds: string[]) {
  'use server';

  if (!chatIds || chatIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  try {
    await Promise.all(chatIds.map((id) => assertOwnsChat(id)));

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
    log.error('Error bulk deleting chats:', error);
    throw new Error('Failed to delete chats');
  }
}

// Add function to update chat visibility
export async function updateChatVisibility(chatId: string, visibility: 'private' | 'public') {
  'use server';

  log.debug('🔄 updateChatVisibility called with:', { chatId, visibility });

  if (!chatId) {
    log.error('❌ updateChatVisibility: No chatId provided');
    throw new Error('Chat ID is required');
  }

  try {
    await assertOwnsChat(chatId);
    log.debug('📡 Calling updateChatVisibilityById with:', { chatId, visibility });
    const result = await updateChatVisibilityById({ chatId, visibility });
    log.debug('✅ updateChatVisibilityById successful, result:', result);

    // Return a serializable plain object instead of raw database result
    return {
      success: true,
      chatId,
      visibility,
      rowCount: result?.rowCount || 0,
    };
  } catch (error) {
    log.error('❌ Error in updateChatVisibility:', {
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
    await assertOwnsChat(chatId);
    return await updateChatPinnedById({ chatId, isPinned });
  } catch (error) {
    log.error('Error updating chat pinned state:', error);
    throw error;
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
      log.error(`No message found with id: ${id}`);
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

    log.debug(`Successfully deleted trailing messages after message ID: ${id}`);
  } catch (error) {
    log.error(`Error deleting trailing messages: ${error}`);
    throw error; // Re-throw to allow caller to handle
  }
}

// Overwrites a single assistant message's parts in place — no trailing
// deletion, no regenerate. Used by the "edit response"/"edit reasoning"
// buttons, which only correct what's already stored and must not touch
// anything downstream (unlike editing a user message, which reopens the turn).
export async function updateMessageParts({ id, parts }: { id: string; parts: ChatMessage['parts'] }) {
  'use server';
  try {
    const user = await getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const [existingMessage] = await getMessageById({ id });
    if (!existingMessage) {
      throw new Error('Message not found');
    }

    if (existingMessage.role !== 'assistant') {
      throw new Error('Only assistant messages can be edited in place');
    }

    const owningChat = await getChatByIdForValidation({ id: existingMessage.chatId });
    if (!owningChat || owningChat.userId !== user.id) {
      throw new Error('Unauthorized');
    }

    await updateMessagePartsById({ id, parts: parts as Message['parts'] });
  } catch (error) {
    log.error(`Error updating message parts: ${error}`);
    throw error;
  }
}

export async function setImageContextVisibility({
  chatId,
  imageUrl,
  hidden,
}: {
  chatId: string;
  imageUrl: string;
  hidden: boolean;
}) {
  'use server';
  try {
    const user = await getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const owningChat = await getChatByIdForValidation({ id: chatId });
    if (!owningChat || owningChat.userId !== user.id) {
      throw new Error('Unauthorized');
    }

    if (hidden) {
      await hideContextImage({ chatId, userId: user.id, imageUrl });
    } else {
      await unhideContextImage({ chatId, imageUrl });
    }
  } catch (error) {
    log.error(`Error setting image context visibility: ${error}`);
    throw error;
  }
}

// Add function to update chat title
export async function updateChatTitle(chatId: string, title: string) {
  'use server';

  if (!chatId || !title.trim() || title.trim().length > CHAT_TITLE_MAX_LENGTH) return null;

  try {
    await assertOwnsChat(chatId);
    return await updateChatTitleById({ chatId, title: title.trim() });
  } catch (error) {
    log.error('Error updating chat title:', error);
    throw error;
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
      searchVector: null,
      isCompactionSummary: messageItem.isCompactionSummary,
      compactionReplacedCount: messageItem.compactionReplacedCount ?? null,
      hermesReaction: null,
      hermesGatewayId: null,
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
    log.error('Error forking chat:', error);
    return { success: false, error: 'Failed to fork chat' };
  }
}

// Branch out a chat - create a new chat with the current user and assistant message pair
export async function branchOutChat({
  userMessage,
  assistantMessage,
}: {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
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
    const chatTitlePromise = generateTitleFromUserMessage({ message: userMessage, userId: currentUser.id });

    // Prepare messages for saving
    const messagesToSave = [
      {
        chatId: newChatId,
        id: newUserMessageId,
        role: 'user' as const,
        parts: userMessage.parts,
        attachments: [],
        createdAt: new Date(),
        model: userMessage.metadata?.model || null,
        inputTokens: userMessage.metadata?.inputTokens ?? null,
        outputTokens: null,
        totalTokens: null,
        completionTime: null,
        searchVector: null,
        isCompactionSummary: false,
        compactionReplacedCount: null,
        hermesReaction: null,
        hermesGatewayId: null,
      },
      {
        chatId: newChatId,
        id: newAssistantMessageId,
        role: 'assistant' as const,
        parts: assistantMessage.parts,
        attachments: [],
        createdAt: new Date(),
        model: assistantMessage.metadata?.model || null,
        inputTokens: assistantMessage.metadata?.inputTokens ?? null,
        outputTokens: assistantMessage.metadata?.outputTokens ?? null,
        totalTokens: assistantMessage.metadata?.totalTokens ?? null,
        completionTime: assistantMessage.metadata?.completionTime ?? null,
        searchVector: null,
        isCompactionSummary: false,
        compactionReplacedCount: null,
        hermesReaction: null,
        hermesGatewayId: null,
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
    log.error('Error branching out chat:', error);
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

// A chat is an Agent chat once it has a hermesConversation row (resolveHermesChatLock).
// Filtered in SQL rather than on the client so pagination stays correct when one mode
// is rare among the user's chats.
function chatModeCondition(mode: ChatModeFilter) {
  if (mode === 'all') return undefined;
  const hasHermesConversation = db
    .select({ chatId: hermesConversation.chatId })
    .from(hermesConversation)
    .where(eq(hermesConversation.chatId, chat.id));
  return mode === 'agent' ? exists(hasHermesConversation) : notExists(hasHermesConversation);
}

export async function getAllChatsWithPreview(limit: number = 25, offset: number = 0, mode: ChatModeFilter = 'all') {
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
        chatModeCondition(mode),
      ),
      orderBy: [desc(chat.isPinned), desc(chat.updatedAt), desc(chat.id)],
      limit,
      offset,
      // Whether this chat is permanently locked to Agent mode (getHermesChatLock's own
      // comment) — the history list's rainbow-dot indicator.
      with: { hermesConversation: true },
    });

    const previewMap = await buildPreviewMap(chats.map((c) => c.id));
    const chatsWithPreview = chats.map(({ hermesConversation, ...c }) => ({
      ...c,
      preview: previewMap[c.id]?.preview ?? null,
      model: previewMap[c.id]?.model ?? null,
      isHermesChat: Boolean(hermesConversation),
    }));

    return { chats: chatsWithPreview };
  } catch (error) {
    log.error('Error fetching chats:', error);
    return { error: 'Failed to fetch chats', status: 500 };
  }
}

// Search chats by title or message content (paginated)
export async function searchChatsByTitle(
  query: string,
  limit: number = 25,
  offset: number = 0,
  mode: ChatModeFilter = 'all',
) {
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

    // A chat matches on content if any of its messages' search_vector matches the
    // query. plainto_tsquery (not to_tsquery) treats raw user input as plain text
    // and never throws on stray operator characters (&, |, !, (, ), :).
    const matchesContent = exists(
      db
        .select({ id: message.id })
        .from(message)
        .where(
          and(eq(message.chatId, chat.id), sql`${message.searchVector} @@ plainto_tsquery('english', ${trimmedQuery})`),
        ),
    );

    const chats = await db.query.chat.findMany({
      where:
        trimmedQuery.length === 0
          ? and(eq(chat.userId, user.id), excludeBuildChats, chatModeCondition(mode))
          : and(
              eq(chat.userId, user.id),
              or(ilike(chat.title, `%${trimmedQuery}%`), matchesContent),
              excludeBuildChats,
              chatModeCondition(mode),
            ),
      orderBy: [desc(chat.isPinned), desc(chat.updatedAt), desc(chat.id)],
      limit,
      offset,
      with: { hermesConversation: true },
    });

    const previewMap = await buildPreviewMap(chats.map((c) => c.id));
    const chatsWithPreview = chats.map(({ hermesConversation, ...c }) => ({
      ...c,
      preview: previewMap[c.id]?.preview ?? null,
      model: previewMap[c.id]?.model ?? null,
      isHermesChat: Boolean(hermesConversation),
    }));

    return { chats: chatsWithPreview };
  } catch (error) {
    log.error('Error searching chats:', error);
    return { error: 'Failed to search chats', status: 500 };
  }
}
