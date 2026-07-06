import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { piiAlias } from '../schema';
import { maindb } from '../index';

export interface PiiAliasEntry {
  token: string;
  entityType: string;
  originalEnc: string;
}

// Tokens are deterministic (HMAC of the normalized original value), so the
// same entity always maps to the same token — a conflict here just means
// this exact value was already vaulted, nothing to update.
export async function upsertPiiAliases(userId: string, entries: PiiAliasEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await maindb
    .insert(piiAlias)
    .values(entries.map((entry) => ({ userId, token: entry.token, entityType: entry.entityType, originalEnc: entry.originalEnc })))
    .onConflictDoNothing();
}

export async function getPiiAliasesByTokens(
  userId: string,
  tokens: string[],
): Promise<Array<{ token: string; originalEnc: string }>> {
  if (tokens.length === 0) return [];

  return maindb
    .select({ token: piiAlias.token, originalEnc: piiAlias.originalEnc })
    .from(piiAlias)
    .where(and(eq(piiAlias.userId, userId), inArray(piiAlias.token, tokens)));
}
