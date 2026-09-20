import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import {
  getPendingHermesConnectorByEnrollmentTokenHash,
  markHermesConnectorEnrolled,
} from '@/lib/db/queries/hermes';
import { encryptGatewaySecret, generateGatewaySecret, hashEnrollmentToken } from '@/lib/hermes/crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-enroll');

// Called by hermes-relay-service's /relay/enroll HTTP endpoint, itself called by the
// user's own `hermes gateway enroll` CLI. Exchanges a short-lived enrollment token
// (generated in the Settings > Hermes tab, see app/actions/hermes.ts) for a long-lived
// per-gateway secret. The plaintext secret is returned exactly once, here — after this
// call it only ever exists encrypted (hermesConnector.gatewaySecretEncrypted) or on the
// user's own machine.
//
// `gatewayId` is chosen by the CALLER (the CLI's --gateway-id, defaulting to
// gw-<hostname> — see hermes_cli/gateway_enroll.py), not by us: we accept and store
// whatever it presents at redemption time, verified against source, not guessed from
// the prose doc.
export async function POST(req: NextRequest) {
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
