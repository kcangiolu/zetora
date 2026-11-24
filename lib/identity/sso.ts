import { computeDiscoveryUrl, type SSOOptions } from '@better-auth/sso';
import { parseGroupsClaim } from './roles';

const OIDC_PROVIDER_ID = 'oidc';

type DefaultSsoProvider = NonNullable<SSOOptions['defaultSSO']>[number];

export interface SsoEnv {
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_GROUPS_CLAIM: string;
  OIDC_SCOPES: string;
  ZETORA_SSO_ONLY: boolean;
}

/**
 * The identity providers declared in .env, in the shape the SSO plugin takes.
 * A partial set is an error rather than a provider that fails at sign-in.
 */
export function buildSsoProviders(env: SsoEnv): DefaultSsoProvider[] {
  const providers: DefaultSsoProvider[] = [];

  const oidc = {
    OIDC_ISSUER: env.OIDC_ISSUER,
    OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
  };
  const missingOidc = Object.entries(oidc)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missingOidc.length > 0 && missingOidc.length < Object.keys(oidc).length) {
    throw new Error(`OpenID Connect sign-in is half configured: set ${missingOidc.join(', ')} in .env.`);
  }
  if (env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET) {
    providers.push({
      providerId: OIDC_PROVIDER_ID,
      // Sign-in always names the provider; no routing by email domain.
      domain: '',
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

  if (env.ZETORA_SSO_ONLY && providers.length === 0) {
    throw new Error(
      'ZETORA_SSO_ONLY=true but no single sign-on is configured: set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET in .env.',
    );
  }
  return providers;
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
