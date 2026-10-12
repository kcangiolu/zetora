'use server';

import { geolocation } from '@vercel/functions';
import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { getChatWithUserById } from '@/lib/db/queries';
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

// Fetch chat meta with user details (server action for client use via React Query)
export async function getChatMeta(chatId: string, viewerUserId?: string) {
  'use server';

  if (!chatId) return null;

  try {
    const chat = await getChatWithUserById({ id: chatId });

    if (!chat) return null;

    const isOwner = viewerUserId ? chat.userId === viewerUserId : false;

    return {
      id: chat.id,
      title: chat.title,
      visibility: chat.visibility as 'public' | 'private',
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      user: {
        id: chat.userId,
        name: chat.userName,
        email: chat.userEmail,
        image: chat.userImage,
      },
      isOwner,
    } as const;
  } catch (error) {
    log.error('Error in getChatMeta:', error);
    return null;
  }
}

// Get user's country code from geolocation
export async function getUserCountryCode() {
  'use server';

  try {
    const headersList = await headers();

    const request = {
      headers: headersList,
    };

    const locationData = geolocation(request);

    return locationData.country || null;
  } catch (error) {
    log.error('Error getting geolocation:', error);
    return null;
  }
}

// Server action to get user's geolocation using Vercel
export async function getUserLocation() {
  try {
    const headersList = await headers();

    const request = {
      headers: headersList,
    };

    const locationData = geolocation(request);

    return {
      country: locationData.country || '',
      countryCode: locationData.country || '',
      city: locationData.city || '',
      region: locationData.region || '',
      isIndia: locationData.country === 'IN',
      loading: false,
    };
  } catch (error) {
    log.error('Failed to get location from Vercel:', error);
    return {
      country: 'Unknown',
      countryCode: '',
      city: '',
      region: '',
      isIndia: false,
      loading: false,
    };
  }
}
