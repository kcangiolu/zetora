import { computeDiscoveryUrl, type SSOOptions } from '@better-auth/sso';
import { parseGroupsClaim } from './roles';

const OIDC_PROVIDER_ID = 'oidc';
const SAML_PROVIDER_ID = 'saml';

// Claim URIs that Microsoft Entra ID, AD FS and Authentik send by default.
const SAML_NAME_ATTRIBUTES = {
  firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
};

type DefaultSsoProvider = NonNullable<SSOOptions['defaultSSO']>[number];

export interface SsoEnv {
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_GROUPS_CLAIM: string;
  OIDC_SCOPES: string;
  SAML_ENTRY_POINT?: string;
  SAML_IDP_ENTITY_ID?: string;
  SAML_IDP_CERT?: string;
  SAML_EMAIL_ATTRIBUTE: string;
  SAML_GROUPS_ATTRIBUTE: string;
  SSO_EMAIL_DOMAINS: readonly string[];
  ZETORA_SSO_ONLY: boolean;
}

/**
 * The identity providers declared in .env, in the shape the SSO plugin takes.
 * A partial set is an error rather than a provider that fails at sign-in.
 */
export function buildSsoProviders(env: SsoEnv, appUrl: string | undefined): DefaultSsoProvider[] {
  const providers: DefaultSsoProvider[] = [];

  if (
    allOrNone('OpenID Connect', {
      OIDC_ISSUER: env.OIDC_ISSUER,
      OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
    }) &&
    env.OIDC_ISSUER &&
    env.OIDC_CLIENT_ID &&
    env.OIDC_CLIENT_SECRET
  ) {
    providers.push({
      providerId: OIDC_PROVIDER_ID,
      domain: linkableDomains(env.SSO_EMAIL_DOMAINS),
      oidcConfig: {
        issuer: env.OIDC_ISSUER,
        discoveryEndpoint: computeDiscoveryUrl(env.OIDC_ISSUER),
        clientId: env.OIDC_CLIENT_ID,
        clientSecret: env.OIDC_CLIENT_SECRET,
        pkce: true,
        scopes: env.OIDC_SCOPES.split(/\s+/).filter(Boolean),
        // The identity provider owns the name and address: a change there
        // shows up here at the next sign-in.
        overrideUserInfo: true,
        mapping: { extraFields: { groups: env.OIDC_GROUPS_CLAIM } },
      },
    });
  }

  if (
    allOrNone('SAML', {
      SAML_ENTRY_POINT: env.SAML_ENTRY_POINT,
      SAML_IDP_ENTITY_ID: env.SAML_IDP_ENTITY_ID,
      SAML_IDP_CERT: env.SAML_IDP_CERT,
    }) &&
    env.SAML_ENTRY_POINT &&
    env.SAML_IDP_ENTITY_ID &&
    env.SAML_IDP_CERT
  ) {
    if (!appUrl) throw new Error('SAML sign-in needs the public URL of Zetora: set BETTER_AUTH_BASE_URL in .env.');
    providers.push({
      providerId: SAML_PROVIDER_ID,
      domain: linkableDomains(env.SSO_EMAIL_DOMAINS),
      samlConfig: {
        // Zetora's own entity ID: the URL of the metadata it publishes, which
        // the identity provider can import.
        issuer: samlServiceProviderMetadataUrl(appUrl),
        entryPoint: env.SAML_ENTRY_POINT,
        idpMetadata: { entityID: env.SAML_IDP_ENTITY_ID, cert: parseCertificates(env.SAML_IDP_CERT) },
        wantAssertionsSigned: true,
        mapping: {
          ...SAML_NAME_ATTRIBUTES,
          email: env.SAML_EMAIL_ATTRIBUTE,
          extraFields: { groups: env.SAML_GROUPS_ATTRIBUTE },
        },
      },
    });
  }

  if (env.ZETORA_SSO_ONLY && providers.length === 0) {
    throw new Error(
      'ZETORA_SSO_ONLY=true but no single sign-on is configured: set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET, or SAML_ENTRY_POINT, SAML_IDP_ENTITY_ID and SAML_IDP_CERT in .env.',
    );
  }
  return providers;
}

/**
 * The plugin trusts a provider's address, and joins its sign-on to an
 * existing account with that address, only for the domains in the provider's
 * `domain`. An entry it cannot parse would silently void the whole list, so
 * it is refused here. Empty: no domain is trusted.
 */
function linkableDomains(domains: readonly string[]): string {
  const invalid = domains.filter((domain) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain));
  if (invalid.length > 0) {
    throw new Error(`SSO_EMAIL_DOMAINS takes bare domains such as example.com, not: ${invalid.join(', ')}.`);
  }
  return domains.map((domain) => domain.toLowerCase()).join(',');
}

/** True when every variable is set, false when none is, an error otherwise. */
function allOrNone(protocol: string, variables: Record<string, string | undefined>): boolean {
  const missing = Object.entries(variables)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length === 0) return true;
  if (missing.length === Object.keys(variables).length) return false;
  throw new Error(`${protocol} sign-in is half configured: set ${missing.join(', ')} in .env.`);
}

function samlServiceProviderMetadataUrl(appUrl: string): string {
  return `${appUrl}/api/auth/sso/saml2/sp/metadata?providerId=${SAML_PROVIDER_ID}`;
}

/**
 * Signing certificates as identity providers hand them out: PEM, or the bare
 * base64 body that fits on one .env line. Several, comma-separated, during a
 * rotation. Returned as PEM.
 */
export function parseCertificates(value: string): string[] {
  return value
    .split(',')
    .map((certificate) => certificate.replace(/-----(BEGIN|END) CERTIFICATE-----|\\n|\s/g, ''))
    .filter(Boolean)
    .map((body) => `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`);
}

/** Origins the SSO plugin must trust to fetch discovery, keys and tokens. */
export function ssoTrustedOrigins(providers: readonly DefaultSsoProvider[]): string[] {
  return providers.flatMap((provider) => (provider.oidcConfig ? [new URL(provider.oidcConfig.issuer).origin] : []));
}

/**
 * Groups from the userinfo response when it carries them, else from the ID
 * token: Microsoft Entra ID puts groups in the ID token only. The plugin has
 * verified this ID token's signature earlier in the same callback.
 *
 * Returns null when neither has the claim.
 */
export function readGroups(
  userInfo: Readonly<Record<string, unknown>>,
  idToken: string | undefined,
  claim: string,
): string[] | null {
  const fromUserInfo = parseGroupsClaim(userInfo.groups);
  if (fromUserInfo) return fromUserInfo;
  if (!idToken) return null;
  const claims = decodeJwtPayload(idToken);
  return claims ? parseGroupsClaim(claims[claim]) : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
