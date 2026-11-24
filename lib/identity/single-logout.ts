import 'server-only';

import { auth, samlSingleLogoutEnabled } from '@/lib/auth';
import { getUser } from '@/lib/auth-utils';
import { hasAccountWithProvider } from '@/lib/db/queries';
import { SAML_PROVIDER_ID } from './sso';

/**
 * Ends the current Zetora session and returns the identity provider URL that
 * ends the provider's session too, or null when the user has no SAML account
 * or the provider declares no logout URL: the caller then signs out locally.
 */
export async function startSamlSingleLogout(requestHeaders: Headers): Promise<string | null> {
  if (!samlSingleLogoutEnabled) return null;
  const user = await getUser();
  if (!user || !(await hasAccountWithProvider(user.id, SAML_PROVIDER_ID))) return null;
  const response = await auth.api.initiateSLO({
    headers: requestHeaders,
    params: { providerId: SAML_PROVIDER_ID },
    body: { callbackURL: '/sign-in' },
    asResponse: true,
  });
  return response.headers.get('location');
}
