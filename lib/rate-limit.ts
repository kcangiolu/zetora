import { getKVRedisClient } from './redis';

import { createLogger } from '@/lib/logger';

const log = createLogger('rate-limit');

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_REQUESTS = 25; // exports per week, per account or per anonymous client

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export const exportRateLimit = {
  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const denied: RateLimitResult = { success: false, limit: MAX_REQUESTS, remaining: 0, reset: now + WINDOW_MS };
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
      const results = await redis.pipeline().zremrangebyscore(key, 0, windowStart).zcard(key).exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      if (count >= MAX_REQUESTS) return denied;

      await redis
        .pipeline()
        .zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`)
        .pexpire(key, WINDOW_MS)
        .exec();
      return { success: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS - count - 1, reset: now + WINDOW_MS };
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
