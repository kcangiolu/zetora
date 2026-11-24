import { describe, it, expect } from 'vitest';
import { parseGroupsClaim, resolveRole, type RoleRules } from '@/lib/identity/roles';
import { buildSsoProviders, readGroups, ssoTrustedOrigins, type SsoEnv } from '@/lib/identity/sso';

const rules: RoleRules = {
  adminEmails: ['Ada@example.com'],
  adminGroups: ['zetora-admins'],
  auditorGroups: ['zetora-auditors'],
};

describe('resolveRole', () => {
  it('makes a verified address listed in ZETORA_ADMIN_EMAILS an admin, whatever its case', () => {
    expect(resolveRole({ email: 'ada@example.com', emailVerified: true, groups: [] }, rules)).toBe('admin');
  });

  it('ignores ZETORA_ADMIN_EMAILS for an address nobody verified', () => {
    expect(resolveRole({ email: 'ada@example.com', emailVerified: false, groups: [] }, rules)).toBe('member');
  });

  it('gives admin over auditor when the user is in both groups', () => {
    const groups = ['zetora-auditors', 'zetora-admins'];
    expect(resolveRole({ email: 'user-1@example.com', emailVerified: false, groups }, rules)).toBe('admin');
  });

  it('gives auditor from an auditor group, and member otherwise', () => {
    const subject = { email: 'user-1@example.com', emailVerified: false };
    expect(resolveRole({ ...subject, groups: ['zetora-auditors'] }, rules)).toBe('auditor');
    expect(resolveRole({ ...subject, groups: ['sales'] }, rules)).toBe('member');
  });

  it('drops the role once the group is gone', () => {
    const subject = { email: 'user-1@example.com', emailVerified: true };
    expect(resolveRole({ ...subject, groups: ['zetora-admins'] }, rules)).toBe('admin');
    expect(resolveRole({ ...subject, groups: [] }, rules)).toBe('member');
  });
});

describe('parseGroupsClaim', () => {
  it('reads an array, dropping blanks, duplicates and non-strings', () => {
    expect(parseGroupsClaim(['a', ' b ', '', 'a', 3])).toEqual(['a', 'b']);
  });

  it('keeps a single string whole, commas included', () => {
    expect(parseGroupsClaim('cn=admins,ou=groups')).toEqual(['cn=admins,ou=groups']);
  });

  it('returns null when there is no claim', () => {
    expect(parseGroupsClaim(undefined)).toBeNull();
    expect(parseGroupsClaim({ groups: [] })).toBeNull();
  });
});

function idToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

describe('readGroups', () => {
  it('prefers the groups of the userinfo response', () => {
    expect(readGroups({ groups: ['a'] }, idToken({ groups: ['b'] }), 'groups')).toEqual(['a']);
  });

  it('falls back to the ID token claim, as Microsoft Entra ID sends it', () => {
    expect(readGroups({}, idToken({ roles: ['b'] }), 'roles')).toEqual(['b']);
  });

  it('returns null when neither carries the claim', () => {
    expect(readGroups({}, idToken({ sub: 'user-1' }), 'groups')).toBeNull();
    expect(readGroups({}, undefined, 'groups')).toBeNull();
    expect(readGroups({}, 'not-a-jwt', 'groups')).toBeNull();
  });
});

const baseEnv: SsoEnv = { OIDC_GROUPS_CLAIM: 'groups', OIDC_SCOPES: 'openid email profile', ZETORA_SSO_ONLY: false };
const oidcEnv: SsoEnv = {
  ...baseEnv,
  OIDC_ISSUER: 'https://idp.example.com/application/o/zetora/',
  OIDC_CLIENT_ID: 'client-1',
  OIDC_CLIENT_SECRET: 'client-secret',
};

describe('buildSsoProviders', () => {
  it('declares nothing when no SSO variable is set', () => {
    expect(buildSsoProviders(baseEnv)).toEqual([]);
  });

  it('declares the OpenID Connect provider with its discovery URL, scopes and groups claim', () => {
    const [provider] = buildSsoProviders({
      ...oidcEnv,
      OIDC_GROUPS_CLAIM: 'roles',
      OIDC_SCOPES: 'openid  email groups',
    });
    expect(provider?.providerId).toBe('oidc');
    expect(provider?.oidcConfig).toMatchObject({
      issuer: oidcEnv.OIDC_ISSUER,
      discoveryEndpoint: 'https://idp.example.com/application/o/zetora/.well-known/openid-configuration',
      clientId: 'client-1',
      pkce: true,
      scopes: ['openid', 'email', 'groups'],
      mapping: { extraFields: { groups: 'roles' } },
    });
  });

  it('names the variables missing from a half-configured provider', () => {
    expect(() => buildSsoProviders({ ...oidcEnv, OIDC_CLIENT_SECRET: undefined })).toThrow(/set OIDC_CLIENT_SECRET/);
  });

  it('refuses SSO-only mode without any provider', () => {
    expect(() => buildSsoProviders({ ...baseEnv, ZETORA_SSO_ONLY: true })).toThrow(/ZETORA_SSO_ONLY=true/);
  });

  it('trusts the origin of the issuer', () => {
    expect(ssoTrustedOrigins(buildSsoProviders(oidcEnv))).toEqual(['https://idp.example.com']);
  });
});
