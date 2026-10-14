import 'server-only';
import { serverEnv } from '@/env/server';
import { secretsEqual } from '@/lib/secure-compare';

export const LOOKOUT_SECRET_HEADER = 'x-lookout-secret';

// CRON_SECRET defaults to "placeholder" in env/server.ts — treat that the
// same as unset so a forgotten env var never becomes a well-known password.
export function getLookoutCallbackSecret(): string | null {
  const secret = serverEnv.CRON_SECRET;
  if (!secret || secret === 'placeholder') return null;
  return secret;
}

// Headers attached when the BullMQ worker (or a direct server-side trigger)
// calls /api/lookout.
export function lookoutCallbackHeaders(): Record<string, string> {
  const secret = getLookoutCallbackSecret();
  return secret ? { [LOOKOUT_SECRET_HEADER]: secret } : {};
}

// QStash only forwards custom headers prefixed with "Upstash-Forward-".
export function lookoutQstashHeaders(): Record<string, string> {
  const secret = getLookoutCallbackSecret();
  return secret ? { [`Upstash-Forward-${LOOKOUT_SECRET_HEADER}`]: secret } : {};
}

type VerifyResult = { ok: true } | { ok: false; status: number; message: string };

// The /api/lookout endpoint runs expensive LLM jobs as the userId given in
// the body, so it must never be callable without the shared secret.
export function verifyLookoutRequest(req: Request): VerifyResult {
  const secret = getLookoutCallbackSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: 'Lookouts are disabled: set CRON_SECRET to enable scheduled search callbacks',
    };
  }
  if (!secretsEqual(req.headers.get(LOOKOUT_SECRET_HEADER), secret)) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true };
}
