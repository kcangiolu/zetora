import 'server-only';

import { getKVRedisClient } from '@/lib/redis';
import { GRAPHITI_INGEST_TIMEOUT_MS } from '@/lib/timeouts';
import { createLogger } from '@/lib/logger';

const log = createLogger('graphiti-write-coordinator');

// Long enough to outlive the slowest realistic add_episode call (LLM entity
// extraction on a single-slot local model) — see GRAPHITI_INGEST_TIMEOUT_MS.
const LOCK_TTL_MS = GRAPHITI_INGEST_TIMEOUT_MS + 20_000;
const LOCK_POLL_MS = 250;
const RECENT_KEY_TTL_S = 600; // 10 min — long enough to catch a curator run racing the live tool call
const RECENT_MAX_ENTRIES = 5;
const DUPLICATE_OVERLAP_THRESHOLD = 0.5;

function lockKey(groupId: string): string {
  return `graphiti:lock:${groupId}`;
}

function recentKey(groupId: string): string {
  return `graphiti:recent:${groupId}`;
}

// Fallback when REDIS_URL isn't configured (local dev): serializes within
// this process only, via a chained promise queue keyed by groupId.
const localQueues = new Map<string, Promise<unknown>>();

function runLocally<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const previous = localQueues.get(groupId) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  localQueues.set(
    groupId,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Serializes Graphiti writes per groupId (userId) across every Next.js
 * instance via a Redis lock, so the background memory curator and the main
 * chat model's live add_memory tool call never race the same single-slot
 * local LLM extraction pipeline for the same user. Falls back to an
 * in-process queue when Redis isn't configured.
 */
export async function withMemoryWriteLock<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const redis = getKVRedisClient();
  if (!redis) return runLocally(groupId, fn);

  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LOCK_TTL_MS;
  let acquired = false;

  while (Date.now() < deadline) {
    const ok = await redis.set(lockKey(groupId), token, 'PX', LOCK_TTL_MS, 'NX');
    if (ok === 'OK') {
      acquired = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }

  if (!acquired) {
    log.warn(`Timed out waiting for Graphiti write lock (groupId=${groupId}) — proceeding unlocked`);
    return fn();
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_SCRIPT, 1, lockKey(groupId), token);
    } catch (err) {
      log.warn('Failed to release Graphiti write lock:', err);
    }
  }
}

function normalize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

// No embeddings/LLM call on purpose — this only needs to catch the narrow
// case of two writers saving the same fact within the same TTL window
// (worded slightly differently), it's not a semantic dedup engine. The
// curator's own search_memories-then-judge step already covers reworded
// duplicates against the durable graph.
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / Math.min(a.size, b.size);
}

/**
 * Checks a short-lived, Redis-backed cache of the last few memories written
 * for this groupId. MUST be called from inside withMemoryWriteLock so the
 * cache reflects any write that just committed while this caller was
 * waiting for the lock.
 */
export async function isDuplicateOfRecentWrite(groupId: string, memory: string): Promise<boolean> {
  const redis = getKVRedisClient();
  if (!redis) return false;

  const entries = await redis.lrange(recentKey(groupId), 0, RECENT_MAX_ENTRIES - 1);
  const candidate = normalize(memory);

  return entries.some((raw) => {
    try {
      const { text } = JSON.parse(raw) as { text: string };
      return overlapRatio(candidate, normalize(text)) >= DUPLICATE_OVERLAP_THRESHOLD;
    } catch {
      return false;
    }
  });
}

export async function recordRecentWrite(groupId: string, memory: string): Promise<void> {
  const redis = getKVRedisClient();
  if (!redis) return;

  const key = recentKey(groupId);
  await redis
    .multi()
    .lpush(key, JSON.stringify({ text: memory, ts: Date.now() }))
    .ltrim(key, 0, RECENT_MAX_ENTRIES - 1)
    .expire(key, RECENT_KEY_TTL_S)
    .exec();
}
