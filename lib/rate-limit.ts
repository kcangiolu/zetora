import { getKVRedisClient } from './redis';

import { serverEnv } from '@/env/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('rate-limit');

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export const exportRateLimit = {
  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const maxRequests = serverEnv.ZETORA_EXPORT_WEEKLY_LIMIT;
    const denied: RateLimitResult = { success: false, limit: maxRequests, remaining: 0, reset: now + WINDOW_MS };
    const redis = getKVRedisClient();
    if (!redis) {
      log.warn('[rate-limit] Redis is not configured — denying export request');
      return denied;
    }
    try {
      const key = `ratelimit:export:${identifier}`;
      const windowStart = now - WINDOW_MS;

      // Sliding-window log: drop entries older than the window and count the
      // rest. A request is recorded only when it is allowed, so a client that
      // keeps hammering a closed window does not keep it closed.
      // Plain commands rather than MULTI: node-redis applies the client's
      // command timeout to them but not to a transaction.
      await redis.zRemRangeByScore(key, 0, windowStart);
      const count = await redis.zCard(key);
      if (count >= maxRequests) return denied;

      await redis.zAdd(key, { score: now, value: `${now}-${Math.random().toString(36).slice(2)}` });
      await redis.pExpire(key, WINDOW_MS);
      return { success: true, limit: maxRequests, remaining: maxRequests - count - 1, reset: now + WINDOW_MS };
    } catch (error) {
      log.error('[rate-limit] limit() failed — denying export request:', error);
      return denied;
    }
  },
};

// The client IP, or null when it cannot be trusted.
//
// zetora.app's port is published on all interfaces (docker-compose.yml), so
// without TRUSTED_PROXY=true every forwarding header is client-controlled.
// With it, the LAST X-Forwarded-For entry is the one the operator's proxy
// appended; earlier entries, X-Real-Ip and CF-Connecting-Ip may still come
// from the client, since not every proxy overwrites them.
export function getClientIp(req: Request): string | null {
  if (process.env.TRUSTED_PROXY !== 'true') return null;

  const forwardedIps = req.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return forwardedIps?.[forwardedIps.length - 1] ?? null;
}

// Rate-limit key: the account when there is one, otherwise the client IP.
// Without a trusted IP every anonymous client shares one bucket.
export function getClientIdentifier(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const ip = getClientIp(req);
  return ip ? `ip:${ip}` : 'ip:unknown';
}
