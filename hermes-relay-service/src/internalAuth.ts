import type { IncomingMessage } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

// Whether an Authorization header carries the shared secret, compared in constant time
// so response timing reveals nothing about a guess. Hashing first gives both sides the
// same length without leaking the secret's.
export function isBearerSecret(authorization: string | undefined, secret: string): boolean {
  if (!authorization) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

// Gates /control/* — calls coming IN from zetora-app. The reverse direction (this
// service calling OUT to zetora-app's /api/internal/hermes/*) is internalClient.ts.
// Same shared secret both ways; see docker-compose.yml's comment on why the compose
// network alone isn't a trust boundary.
export function isAuthorizedInternalCaller(req: IncomingMessage): boolean {
  return isBearerSecret(req.headers.authorization, config.internalSecret);
}
