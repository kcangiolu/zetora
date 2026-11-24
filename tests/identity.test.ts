import { describe, it, expect } from 'vitest';
import { parseGroupsClaim, resolveRole, type RoleRules } from '@/lib/identity/roles';
import { buildSsoProviders, parseCertificates, readGroups, ssoTrustedOrigins, type SsoEnv } from '@/lib/identity/sso';

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

const appUrl = 'https://chat.example.com';
const baseEnv: SsoEnv = {
  OIDC_GROUPS_CLAIM: 'groups',
  OIDC_SCOPES: 'openid email profile',
  SAML_EMAIL_ATTRIBUTE: 'email',
  SAML_GROUPS_ATTRIBUTE: 'groups',
  SSO_EMAIL_DOMAINS: [],
  ZETORA_SSO_ONLY: false,
};
const oidcEnv: SsoEnv = {
  ...baseEnv,
  OIDC_ISSUER: 'https://idp.example.com/application/o/zetora/',
  OIDC_CLIENT_ID: 'client-1',
  OIDC_CLIENT_SECRET: 'client-secret',
};
// A certificate body is public; this one only has the shape of one.
const certificateBody = 'QUJD'.repeat(40);
const samlEnv: SsoEnv = {
  ...baseEnv,
  SAML_ENTRY_POINT: 'https://idp.example.com/application/saml/zetora/sso/binding/redirect/',
  SAML_IDP_ENTITY_ID: 'https://idp.example.com/application/saml/zetora/',
  SAML_IDP_CERT: certificateBody,
};

describe('buildSsoProviders', () => {
  it('declares nothing when no SSO variable is set', () => {
    expect(buildSsoProviders(baseEnv, appUrl)).toEqual([]);
  });

  it('declares the OpenID Connect provider with its discovery URL, scopes and groups claim', () => {
    const [provider] = buildSsoProviders(
      {
        ...oidcEnv,
        OIDC_GROUPS_CLAIM: 'roles',
        OIDC_SCOPES: 'openid  email groups',
      },
      appUrl,
    );
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
    expect(() => buildSsoProviders({ ...oidcEnv, OIDC_CLIENT_SECRET: undefined }, appUrl)).toThrow(
      /set OIDC_CLIENT_SECRET/,
    );
  });

  it('refuses SSO-only mode without any provider', () => {
    expect(() => buildSsoProviders({ ...baseEnv, ZETORA_SSO_ONLY: true }, appUrl)).toThrow(/ZETORA_SSO_ONLY=true/);
  });

  it('trusts the origin of the issuer', () => {
    expect(ssoTrustedOrigins(buildSsoProviders(oidcEnv, appUrl))).toEqual(['https://idp.example.com']);
  });

  it('declares the SAML provider with signed assertions and the attributes to read', () => {
    const [provider] = buildSsoProviders(
      { ...samlEnv, SAML_GROUPS_ATTRIBUTE: 'http://schemas.xmlsoap.org/claims/Group' },
      appUrl,
    );
    expect(provider?.providerId).toBe('saml');
    expect(provider?.samlConfig).toMatchObject({
      issuer: 'https://chat.example.com/api/auth/sso/saml2/sp/metadata?providerId=saml',
      entryPoint: samlEnv.SAML_ENTRY_POINT,
      idpMetadata: { entityID: samlEnv.SAML_IDP_ENTITY_ID, cert: parseCertificates(certificateBody) },
      wantAssertionsSigned: true,
      mapping: { email: 'email', extraFields: { groups: 'http://schemas.xmlsoap.org/claims/Group' } },
    });
  });

  it('declares both providers side by side', () => {
    const providers = buildSsoProviders({ ...oidcEnv, ...samlEnv, OIDC_ISSUER: oidcEnv.OIDC_ISSUER }, appUrl);
    expect(providers.map((provider) => provider.providerId)).toEqual(['oidc', 'saml']);
  });

  it('names what a half-configured SAML provider misses, the public URL included', () => {
    expect(() => buildSsoProviders({ ...samlEnv, SAML_IDP_CERT: undefined }, appUrl)).toThrow(/set SAML_IDP_CERT/);
    expect(() => buildSsoProviders(samlEnv, undefined)).toThrow(/BETTER_AUTH_BASE_URL/);
  });
});

describe('SSO_EMAIL_DOMAINS', () => {
  it('trusts no domain by default', () => {
    expect(buildSsoProviders(oidcEnv, appUrl).map((provider) => provider.domain)).toEqual(['']);
  });

  it('gives every provider the domains whose sign-on may join an existing account', () => {
    const providers = buildSsoProviders(
      { ...oidcEnv, ...samlEnv, OIDC_ISSUER: oidcEnv.OIDC_ISSUER, SSO_EMAIL_DOMAINS: ['Example.com', 'example.org'] },
      appUrl,
    );
    expect(providers.map((provider) => provider.domain)).toEqual([
      'example.com,example.org',
      'example.com,example.org',
    ]);
  });

  it('refuses an entry that is not a bare domain', () => {
    expect(() => buildSsoProviders({ ...oidcEnv, SSO_EMAIL_DOMAINS: ['@example.com'] }, appUrl)).toThrow(
      /not: @example.com/,
    );
    expect(() => buildSsoProviders({ ...oidcEnv, SSO_EMAIL_DOMAINS: ['https://example.com'] }, appUrl)).toThrow(
      /SSO_EMAIL_DOMAINS/,
    );
  });
});

describe('parseCertificates', () => {
  const pem = `-----BEGIN CERTIFICATE-----\n${certificateBody.slice(0, 64)}\n${certificateBody.slice(64, 128)}\n${certificateBody.slice(128)}\n-----END CERTIFICATE-----`;

  it('turns a bare base64 body into PEM with 64-character lines', () => {
    expect(parseCertificates(certificateBody)).toEqual([pem]);
  });

  it('accepts PEM, with real or escaped line breaks', () => {
    expect(parseCertificates(pem)).toEqual([pem]);
    expect(parseCertificates(pem.replaceAll('\n', '\\n'))).toEqual([pem]);
  });

  it('splits a rotation into one certificate each', () => {
    expect(parseCertificates(`${certificateBody}, ${certificateBody}`)).toEqual([pem, pem]);
  });
});
