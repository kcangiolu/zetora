export type Role = 'admin' | 'auditor' | 'member';

export interface RoleRules {
  adminEmails: readonly string[];
  adminGroups: readonly string[];
  auditorGroups: readonly string[];
}

export interface RoleSubject {
  email: string;
  emailVerified: boolean;
  groups: readonly string[];
}

/**
 * The role is derived on every read instead of stored, so removing someone
 * from a group in the identity provider, or an address from the .env, takes
 * effect without any state left behind to clean up.
 *
 * An email grants admin only once verified: on an instance that lets accounts
 * sign in unverified, anyone could otherwise sign up with the admin's address.
 */
export function resolveRole(subject: RoleSubject, rules: RoleRules): Role {
  const email = subject.email.toLowerCase();
  if (subject.emailVerified && rules.adminEmails.some((adminEmail) => adminEmail.toLowerCase() === email)) {
    return 'admin';
  }
  if (subject.groups.some((group) => rules.adminGroups.includes(group))) return 'admin';
  if (subject.groups.some((group) => rules.auditorGroups.includes(group))) return 'auditor';
  return 'member';
}

/**
 * Identity providers send groups as an array, or as a single string when the
 * user has one group. A string is never split: LDAP-style names such as
 * `cn=admins,ou=groups` contain commas. Anything else reads as no claim.
 */
export function parseGroupsClaim(value: unknown): string[] | null {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null;
  if (!values) return null;
  const groups = values
    .filter((group): group is string => typeof group === 'string')
    .map((group) => group.trim())
    .filter(Boolean);
  return Array.from(new Set(groups));
}
