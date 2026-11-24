import { startSingleLogout } from '@/app/actions';
import { signOut } from '@/lib/auth-client';

/**
 * Signs out of Zetora. Returns the identity provider URL to send the browser
 * to when the session came from a SAML provider with single logout, which
 * ends its session as well; null once signed out locally.
 */
export async function signOutEverywhere(): Promise<string | null> {
  const identityProviderUrl = await startSingleLogout();
  if (identityProviderUrl) return identityProviderUrl;
  await signOut();
  return null;
}
