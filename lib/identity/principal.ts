import 'server-only';

import { cache } from 'react';
import { serverEnv } from '@/env/server';
import { getUser } from '@/lib/auth-utils';
import { getUserGroupNames } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { resolveRole, type Role, type RoleRules } from './roles';

export interface Principal {
  userId: string;
  email: string;
  name: string;
  role: Role;
  groups: string[];
}

export const roleRules: RoleRules = {
  adminEmails: serverEnv.ZETORA_ADMIN_EMAILS,
  adminGroups: serverEnv.ZETORA_ADMIN_GROUPS,
  auditorGroups: serverEnv.ZETORA_AUDITOR_GROUPS,
};

/** Who is making this request, with the role their email and groups give. */
const getPrincipal = cache(async (): Promise<Principal | null> => {
  const user = await getUser();
  if (!user) return null;
  const groups = await getUserGroupNames(user.id);
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: resolveRole({ email: user.email, emailVerified: user.emailVerified, groups }, roleRules),
    groups,
  };
});

/** Throws unauthorized:auth when signed out, forbidden:auth for any other role. */
export async function requireRole(allowed: readonly Role[]): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw new ChatSDKError('unauthorized:auth');
  if (!allowed.includes(principal.role)) throw new ChatSDKError('forbidden:auth');
  return principal;
}
