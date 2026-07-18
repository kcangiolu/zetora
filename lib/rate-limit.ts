import { getKVRedisClient } from './redis';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_REQUESTS = 25; // 25 requests per week for unauthenticated users

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export const unauthenticatedRateLimit = {
  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const denied: RateLimitResult = { success: false, limit: MAX_REQUESTS, remaining: 0, reset: now + WINDOW_MS };
    const redis = getKVRedisClient();
    if (!redis) {
      console.warn('[rate-limit] Redis is not configured — denying unauthenticated request');
      return denied;
    }
    try {
      const key = `ratelimit:unauth:${identifier}`;
      const windowStart = now - WINDOW_MS;

      // Sliding-window log: drop entries older than the window, record this
      // request, then count what's left — all in one round trip.
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
      pipeline.zcard(key);
      pipeline.pexpire(key, WINDOW_MS);
      const results = await pipeline.exec();

      const count = Number(results?.[2]?.[1] ?? 0);
      const success = count <= MAX_REQUESTS;
      return { success, limit: MAX_REQUESTS, remaining: Math.max(0, MAX_REQUESTS - count), reset: now + WINDOW_MS };
    } catch (error) {
      console.error('[rate-limit] limit() failed — denying unauthenticated request:', error);
      return denied;
    }
  },
};

// Helper function to get IP address from request.
//
// zetora.app's port is published on all interfaces (docker-compose.yml), so
// without TRUSTED_PROXY=true these headers are entirely client-controlled —
// trusting them would let anyone bypass rate limiting by spoofing a fresh IP
// on every request. Only trust them once the operator confirms every request
// actually passes through their reverse proxy first (see .env.example).
export function getClientIdentifier(req: Request): string {
  if (process.env.TRUSTED_PROXY !== 'true') return 'ip:unknown';

  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const forwarded = req.headers.get('x-forwarded-for');
  // X-Forwarded-For is a comma-separated hop chain; a well-behaved proxy
  // appends (never replaces), so the FIRST entry is still whatever the
  // client sent. The LAST entry is the one our own proxy added — take that,
  // not the first.
  const forwardedIps = forwarded
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = cfConnectingIp?.trim() || realIp?.trim() || forwardedIps?.[forwardedIps.length - 1];
  return ip ? `ip:${ip}` : 'ip:unknown';
}
