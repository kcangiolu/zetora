import 'server-only';

import { serverEnv } from '@/env/server';
import { INTERNAL_SERVICE_TIMEOUT_MS } from '@/lib/timeouts';

// The only place in zetora-app that calls OUT to hermes-relay-service (the reverse of
// lib/hermes/internal-auth.ts, which gates calls coming IN from it). Same shared-secret
// scheme both ways — see docker-compose.yml's comment on why the compose network alone
// isn't a trust boundary.
export interface DeliverResult {
  success: boolean;
  error?: string;
}

export async function deliverToGateway(params: {
  gatewayId: string;
  event: Record<string, unknown>;
}): Promise<DeliverResult> {
  const res = await fetch(`${serverEnv.HERMES_RELAY_SERVICE_URL}/control/deliver`, {
    signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.HERMES_RELAY_INTERNAL_SECRET}`,
    },
    body: JSON.stringify(params),
  });

  const body = (await res.json().catch(() => null)) as DeliverResult | null;
  if (!res.ok || !body) {
    return { success: false, error: body?.error ?? `hermes-relay-service returned ${res.status}` };
  }
  return body;
}
