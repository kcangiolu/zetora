import { SupadataError } from '@supadata/js';
import pLimit from 'p-limit';
import { EXTERNAL_API_TIMEOUT_MS, withTimeout } from '@/lib/timeouts';

// Supadata answers a burst of parallel requests with 429 (limit-exceeded), and its SDK sets no
// request timeout, so a YouTube search fanning out a dozen transcript lookups could hold the
// reply for minutes. Every Supadata call of one tool run goes through a single queue with a few
// slots, a per-call timeout and a shared deadline; past the deadline the remaining lookups fail
// fast and the tool answers with what it already has.
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 1_000;

export type SupadataCall = <T>(label: string, call: () => Promise<T>) => Promise<T>;

interface SupadataCallerOptions {
  deadlineMs: number;
  concurrency?: number;
  callTimeoutMs?: number;
  rateLimitRetries?: number;
  rateLimitBackoffMs?: number;
}

function isRateLimited(error: unknown): boolean {
  return error instanceof SupadataError && error.error === 'limit-exceeded';
}

export function createSupadataCaller({
  deadlineMs,
  concurrency = DEFAULT_CONCURRENCY,
  callTimeoutMs = EXTERNAL_API_TIMEOUT_MS,
  rateLimitRetries = DEFAULT_RATE_LIMIT_RETRIES,
  rateLimitBackoffMs = DEFAULT_RATE_LIMIT_BACKOFF_MS,
}: SupadataCallerOptions): SupadataCall {
  const limit = pLimit(concurrency);

  return (label, call) =>
    limit(async () => {
      for (let attempt = 0; ; attempt++) {
        const remainingMs = deadlineMs - Date.now();
        if (remainingMs <= 0) throw new Error(`Supadata ${label}: time budget spent`);
        try {
          return await withTimeout(call(), Math.min(callTimeoutMs, remainingMs), `Supadata ${label} timed out`);
        } catch (error) {
          if (!isRateLimited(error) || attempt >= rateLimitRetries) throw error;
          // The slot stays held while backing off, which is what slows the run down under 429s.
          await new Promise((resolve) => setTimeout(resolve, rateLimitBackoffMs * (attempt + 1)));
        }
      }
    });
}
