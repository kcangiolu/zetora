import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// env/server.ts defaults these to "placeholder" — Redis.fromEnv() would then
// throw on the first limit() call, turning every unauthenticated request
// into a 500. Detect the missing config once and fail closed instead.
function hasUpstashConfig(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return Boolean(url && token && url !== 'placeholder' && token !== 'placeholder');
}

let limiter: Ratelimit | null = null;
function getLimiter(): Ratelimit | null {
  if (!hasUpstashConfig()) return null;
  if (!limiter) {
    // Allows 25 requests per week for unauthenticated users
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(25, '7 d'), // 25 requests per 1 week
      analytics: true,
      prefix: '@upstash/ratelimit:unauth',
    });
  }
  return limiter;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export const unauthenticatedRateLimit = {
  async limit(identifier: string): Promise<RateLimitResult> {
    const denied: RateLimitResult = { success: false, limit: 0, remaining: 0, reset: Date.now() };
    const active = getLimiter();
    if (!active) {
      console.warn('[rate-limit] Upstash Redis is not configured — denying unauthenticated request');
      return denied;
    }
    try {
      const { success, limit, remaining, reset } = await active.limit(identifier);
      return { success, limit, remaining, reset };
    } catch (error) {
      console.error('[rate-limit] limit() failed — denying unauthenticated request:', error);
      return denied;
    }
  },
};

// Helper function to get IP address from request
export function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp?.trim() || cfConnectingIp?.trim();
  return ip ? `ip:${ip}` : 'ip:unknown';
}
