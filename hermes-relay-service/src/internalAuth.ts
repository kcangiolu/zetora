import type { IncomingMessage } from 'node:http';
import { config } from './config.js';

// Gates /control/* — calls coming IN from zetora-app. The reverse direction (this
// service calling OUT to zetora-app's /api/internal/hermes/*) is internalClient.ts.
// Same shared secret both ways; see docker-compose.yml's comment on why the compose
// network alone isn't a trust boundary.
export function isAuthorizedInternalCaller(req: IncomingMessage): boolean {
  return req.headers.authorization === `Bearer ${config.internalSecret}`;
}
