import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import {
  getPendingHermesConnectorByEnrollmentTokenHash,
  markHermesConnectorEnrolled,
} from '@/lib/db/queries/hermes';
import { encryptGatewaySecret, generateGatewaySecret, hashEnrollmentToken } from '@/lib/hermes/crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-enroll');

// Called by hermes-relay-service's /relay/enroll, itself called by `hermes gateway
// enroll`. Exchanges a short-lived enrollment token (Settings > Hermes) for a per-gateway
// secret, returned in plaintext only here; afterwards it exists only encrypted
// (hermesConnector.gatewaySecretEncrypted) or on the user's machine. `gatewayId` is the
// caller's choice (the CLI's --gateway-id, gw-<hostname> by default) and stored as is.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  const authError = assertInternalHermesAuth(req);
  if (authError) return authError;

  let body: { enrollmentToken?: string; gatewayId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const enrollmentToken = body.enrollmentToken;
  const gatewayId = body.gatewayId;
  if (!enrollmentToken || typeof enrollmentToken !== 'string') {
    return NextResponse.json({ error: 'enrollmentToken is required' }, { status: 400 });
  }
  if (!gatewayId || typeof gatewayId !== 'string') {
    return NextResponse.json({ error: 'gatewayId is required' }, { status: 400 });
  }

  try {
    const connector = await getPendingHermesConnectorByEnrollmentTokenHash(hashEnrollmentToken(enrollmentToken));
    if (!connector) {
      return NextResponse.json({ error: 'Invalid or expired enrollment token' }, { status: 404 });
    }

    const gatewaySecret = generateGatewaySecret();
    await markHermesConnectorEnrolled({
      id: connector.id,
      gatewayId,
      gatewaySecretEncrypted: encryptGatewaySecret(gatewaySecret),
      gatewaySecretPrefix: gatewaySecret.slice(0, 8),
    });

    return NextResponse.json({ gatewayId, gatewaySecret });
  } catch (error) {
    log.error('Enrollment failed:', error);
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 });
  }
}
