import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { serverEnv } from '@/env/server';
import { getUser } from '@/lib/auth-utils';

// Short-lived token minted by /api/voice/local-session so the s2s-service
// (a separate container with no browser cookie) can call back into
// /api/transcribe, /api/v1/chat/completions and /api/tts/stream as the same
// user whose preferences (STT/TTS/model) must be resolved. Signed with the
// same secret as auth sessions — no extra secret to provision.
const TOKEN_TTL_MS = 10 * 60 * 1000;

function sign(encodedPayload: string): string {
  return createHmac('sha256', serverEnv.BETTER_AUTH_SECRET).update(encodedPayload).digest('base64url');
}

export function createVoiceSessionToken(userId: string): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + TOKEN_TTL_MS });
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifyVoiceSessionToken(token: string): string | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) return null;

  try {
    const { userId, exp } = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (typeof userId !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
    return userId;
  } catch {
    return null;
  }
}

function getBearerVoiceSessionUserId(req: Request | NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return verifyVoiceSessionToken(header.slice('Bearer '.length));
}

// Resolves the acting userId for routes shared between the browser (cookie
// session) and the s2s-service (Bearer voice-session token). Bearer is
// checked first since the s2s-service always sends it and never has cookies.
export async function resolveVoiceRequestUserId(req: Request | NextRequest): Promise<string | null> {
  const bearerUserId = getBearerVoiceSessionUserId(req);
  if (bearerUserId) return bearerUserId;

  const user = await getUser().catch(() => null);
  return user?.id ?? null;
}
