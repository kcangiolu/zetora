import 'server-only';

import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { user, type User } from '../schema';
import { ChatSDKError } from '../../errors';
import { db } from '../index';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

// Cache user lookups for the duration of the request
// Cache user by ID lookups for the duration of the request
export const getUserById = cache(async (id: string): Promise<User | null> => {
  try {
    const [selectedUser] = await db.select().from(user).where(eq(user.id, id)).limit(1);
    return selectedUser || null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get user by id');
  }
});
