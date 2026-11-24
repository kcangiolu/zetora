import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { account, group, user, userGroup } from '../schema';
import { databaseError } from '../../errors';
import { maindb } from '../index';

// Reads go to the primary: a role is read right after the sign-in that
// rewrote the groups, before a replica would have them.

/** Makes the user a member of exactly these groups, creating unknown ones. */
export async function replaceUserGroups(userId: string, groupNames: readonly string[]): Promise<void> {
  try {
    await maindb.transaction(async (tx) => {
      await tx.delete(userGroup).where(eq(userGroup.userId, userId));
      if (groupNames.length === 0) return;
      await tx
        .insert(group)
        .values(groupNames.map((name) => ({ name })))
        .onConflictDoNothing({ target: group.name });
      const rows = await tx
        .select({ id: group.id })
        .from(group)
        .where(inArray(group.name, [...groupNames]));
      await tx.insert(userGroup).values(rows.map((row) => ({ userId, groupId: row.id })));
    });
  } catch (error) {
    throw databaseError('Failed to replace user groups', error);
  }
}

export async function getUserGroupNames(userId: string): Promise<string[]> {
  try {
    const rows = await maindb
      .select({ name: group.name })
      .from(userGroup)
      .innerJoin(group, eq(group.id, userGroup.groupId))
      .where(eq(userGroup.userId, userId))
      .orderBy(asc(group.name));
    return rows.map((row) => row.name);
  } catch (error) {
    throw databaseError('Failed to get user groups', error);
  }
}

export interface UserWithGroups {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  groups: string[];
}

export async function listUsersWithGroups(): Promise<UserWithGroups[]> {
  try {
    const [users, memberships] = await Promise.all([
      maindb
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(asc(user.createdAt)),
      maindb
        .select({ userId: userGroup.userId, name: group.name })
        .from(userGroup)
        .innerJoin(group, eq(group.id, userGroup.groupId))
        .orderBy(asc(group.name)),
    ]);
    const groupsByUser = new Map<string, string[]>();
    for (const membership of memberships) {
      const groups = groupsByUser.get(membership.userId) ?? [];
      groups.push(membership.name);
      groupsByUser.set(membership.userId, groups);
    }
    return users.map((row) => ({ ...row, groups: groupsByUser.get(row.id) ?? [] }));
  } catch (error) {
    throw databaseError('Failed to list users', error);
  }
}

export async function hasAccountWithProvider(userId: string, providerId: string): Promise<boolean> {
  try {
    const [row] = await maindb
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
      .limit(1);
    return row !== undefined;
  } catch (error) {
    throw databaseError('Failed to look up the account', error);
  }
}
