import 'server-only';

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/env/server';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// Kept separate from lib/mcp/crypto.ts so Hermes's key lifecycle isn't coupled to MCP's,
// even though the scheme is identical. HERMES_GATEWAY_SECRET_ENCRYPTION_KEY defaults to
// "placeholder" in env/server.ts (same pattern as MCP_CREDENTIALS_ENCRYPTION_KEY) — treat
// that, and an empty value, as unset so a forgotten env var never silently degrades to a
// well-known encryption key.
function getEncryptionKey() {
  const key = serverEnv.HERMES_GATEWAY_SECRET_ENCRYPTION_KEY;
  if (!key || key === 'placeholder') {
    throw new Error(
      'HERMES_GATEWAY_SECRET_ENCRYPTION_KEY is not configured. Set it to a strong random value before enrolling a Hermes gateway.',
    );
  }
  return createHash('sha256').update(key, 'utf8').digest();
}

export function encryptGatewaySecret(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptGatewaySecret(value: string) {
  const [ivBase64, authTagBase64, encryptedBase64] = value.split(':');
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) throw new Error('Invalid encrypted gateway secret format');

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

// One-way — used only to check a short-lived enrollment code ("did the caller present
// the code we handed out"), never to recover it. Distinct from the gateway secret above,
// which must be reversible.
export function hashEnrollmentToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateGatewaySecret() {
  return randomBytes(32).toString('hex');
}

// Recomputes the relay contract's WS-upgrade bearer signature and compares it in constant
// time against what the gateway presented. Mirrors gateway/relay/auth.py's make_token /
// verify_signature exactly:
// sig is a HEX HMAC-SHA256 digest (hmac.new(...).hexdigest()), not base64 — and `exp` is a
// unix-SECONDS integer, with 0 meaning "never expires" (checked by the caller, not here).
// The secret has to be stored reversibly (encryptGatewaySecret/decryptGatewaySecret)
// rather than hashed because verifying an HMAC requires recomputing it from the raw key.
export function verifyGatewayHmac({
  gatewaySecret,
  payload,
  exp,
  sig,
}: {
  gatewaySecret: string;
  payload: string;
  exp: string;
  sig: string;
}): boolean {
  const expectedHex = createHmac('sha256', gatewaySecret).update(`${payload}:${exp}`).digest('hex');
  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = Buffer.from(expectedHex, 'hex');
    provided = Buffer.from(sig, 'hex');
  } catch {
    return false;
  }
  if (provided.length === 0 || provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}
