import { NextRequest, NextResponse } from 'next/server';
import { getPendingHermesConnectorByEnrollmentTokenHash } from '@/lib/db/queries/hermes';
import { hashEnrollmentToken } from '@/lib/hermes/crypto';

// Deliberately public / unauthenticated — this is the "ambient token endpoint" mode of
// Hermes's gateway.idp.token_url (gateway/relay/__init__.py's _resolve_relay_identity_token,
// mode 1b: "possession of the (typically loopback) endpoint is the credential"). The
// user's own `hermes gateway enroll` CLI GETs this URL (configured via
// GATEWAY_RELAY_IDP_TOKEN_URL) before POSTing to hermes-relay-service's /relay/enroll, and
// presents whatever this returns as that request's Authorization bearer.
//
// The URL's <token> path segment IS the enrollment token from Settings > Hermes — so
// simply knowing the URL (which only that Zetora user was shown, once) is already the
// credential. Echoing it back as the access_token adds no separate secret to manage: the
// enroll POST's body carries the same token explicitly, so this only needs to prove the
// token is still a live, pending enrollment before the CLI bothers dialing the connector.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const connector = await getPendingHermesConnectorByEnrollmentTokenHash(hashEnrollmentToken(token));
  if (!connector) {
    return NextResponse.json({ error: 'Invalid or expired enrollment token' }, { status: 404 });
  }

  return NextResponse.json({ access_token: token });
}
