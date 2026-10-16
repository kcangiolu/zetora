import { NextRequest, NextResponse } from 'next/server';
import { getPendingHermesConnectorByEnrollmentTokenHash } from '@/lib/db/queries/hermes';
import { hashEnrollmentToken } from '@/lib/hermes/crypto';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';

// Public on purpose: Hermes's "ambient token endpoint" mode for gateway.idp.token_url,
// where possessing the URL is the credential. `hermes gateway enroll` GETs it
// (GATEWAY_RELAY_IDP_TOKEN_URL) and sends the result as the bearer of /relay/enroll.
// The <token> segment is the enrollment token shown once in Settings > Hermes, so this
// only checks it is still a pending enrollment and echoes it back as the access_token.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  const { token } = await params;

  const connector = await getPendingHermesConnectorByEnrollmentTokenHash(hashEnrollmentToken(token));
  if (!connector) {
    return NextResponse.json({ error: 'Invalid or expired enrollment token' }, { status: 404 });
  }

  return NextResponse.json({ access_token: token });
}
