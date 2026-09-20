import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { getHermesConnectorByGatewayId } from '@/lib/db/queries/hermes';
import { decryptGatewaySecret, verifyGatewayHmac } from '@/lib/hermes/crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-verify-gateway-auth');

// Called by hermes-relay-service on every /relay WebSocket upgrade attempt. The gateway
// presents an Authorization bearer token shaped base64url(payload:exp:sig) where
// payload=gatewayId and sig=HMAC-SHA256(`${payload}:${exp}`, gatewaySecret) — see
// docs/relay-connector-contract.md §6.1 on the Hermes side. hermes-relay-service decodes
// the token and forwards its parts here rather than holding any gateway secret itself.
export async function POST(req: NextRequest) {
  const authError = assertInternalHermesAuth(req);
  if (authError) return authError;

  let body: { gatewayId?: string; payload?: string; exp?: string; sig?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, reason: 'invalid_json' }, { status: 400 });
  }

  const { gatewayId, payload, exp, sig } = body;
  if (!gatewayId || !payload || !exp || !sig) {
    return NextResponse.json({ valid: false, reason: 'missing_fields' }, { status: 400 });
  }
  if (payload !== gatewayId) {
    return NextResponse.json({ valid: false, reason: 'payload_mismatch' });
  }

  // gateway/relay/auth.py's make_token: exp is a unix-SECONDS integer, 0 = never expires.
  // (Not milliseconds — verified by reading the actual Hermes source, not assumed from
  // the prose doc.)
  const expSeconds = Number(exp);
  if (!Number.isFinite(expSeconds)) {
    return NextResponse.json({ valid: false, reason: 'malformed_exp' });
  }
  if (expSeconds !== 0 && Math.floor(Date.now() / 1000) > expSeconds) {
    return NextResponse.json({ valid: false, reason: 'expired' });
  }

  try {
    const connector = await getHermesConnectorByGatewayId(gatewayId);
    if (!connector || connector.status !== 'enrolled' || !connector.gatewaySecretEncrypted) {
      return NextResponse.json({ valid: false, reason: 'unknown_or_revoked_gateway' });
    }

    const gatewaySecret = decryptGatewaySecret(connector.gatewaySecretEncrypted);
    const valid = verifyGatewayHmac({ gatewaySecret, payload, exp, sig });

    return NextResponse.json({ valid, userId: valid ? connector.userId : undefined });
  } catch (error) {
    log.error('Gateway auth verification failed:', error);
    return NextResponse.json({ valid: false, reason: 'internal_error' }, { status: 500 });
  }
}
