// Wire-format knowledge for the gateway→connector WS-upgrade bearer token
// (docs/relay-connector-contract.md §6.1 on the Hermes side). Kept isolated here per the
// plan's risk-containment rule: this is the one place in the whole system that knows this
// shape, so a breaking protocol change touches only this file, not zetora-app.
export interface ParsedGatewayToken {
  gatewayId: string;
  payload: string;
  exp: string;
  sig: string;
}

// Token shape: base64url(`${payload}:${exp}:${sig}`), payload === gatewayId, sig a hex
// HMAC digest. Split from the RIGHT (last two ':'-segments are exp/sig, everything before
// is payload) — mirrors gateway/relay/auth.py's verify_token exactly, since gatewayId is
// not guaranteed colon-free by the protocol even though our own generateId() never
// produces one.
export function parseGatewayBearerToken(authorizationHeader: string | undefined): ParsedGatewayToken | null {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  const raw = authorizationHeader.slice('Bearer '.length);

  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const parts = decoded.split(':');
  if (parts.length < 3) return null;
  const sig = parts[parts.length - 1];
  const exp = parts[parts.length - 2];
  const payload = parts.slice(0, -2).join(':');
  if (!payload || !exp || !sig) return null;

  return { gatewayId: payload, payload, exp, sig };
}
