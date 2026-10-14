'use server';

import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { getChatWithUserById } from '@/lib/db/queries';
import { getUser } from '@/lib/auth-utils';
import { db, maindb } from '@/lib/db';
import { chat, message, buildSession, type User } from '@/lib/db/schema';
import { eq, desc, ilike, and, asc, inArray, notExists } from 'drizzle-orm';
import type { CharacterAlignmentResponseModel } from '@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel';
import { getComprehensiveUserData } from '@/lib/user-data-server';
import { headers } from 'next/headers';
import { lookoutCallbackHeaders, lookoutQstashHeaders } from '@/lib/lookout-auth';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';

import { createLogger } from '@/lib/logger';

const log = createLogger('user');

// Server action to get the current user with Pro status - UNIFIED VERSION
export async function getCurrentUser() {
  'use server';

  return await getComprehensiveUserData();
}

// Header metadata for a chat. A private chat is visible to its owner only, and
// the owner's id and email never leave the server.
export async function getChatMeta(chatId: string) {
  'use server';

  if (!chatId) return null;

  try {
    const [chat, viewer] = await Promise.all([getChatWithUserById({ id: chatId }), getUser()]);

    if (!chat) return null;

    const isOwner = viewer ? chat.userId === viewer.id : false;
    if (chat.visibility !== 'public' && !isOwner) return null;

    return {
      id: chat.id,
      title: chat.title,
      visibility: chat.visibility as 'public' | 'private',
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      user: {
        name: chat.userName,
        image: chat.userImage,
      },
      isOwner,
    } as const;
  } catch (error) {
    log.error('Error in getChatMeta:', error);
    return null;
  }
}
