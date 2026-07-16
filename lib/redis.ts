import { createClient } from 'redis';
import IORedis from 'ioredis';

let publisher: ReturnType<typeof createClient> | null = null;
let subscriber: ReturnType<typeof createClient> | null = null;

export function getResumableStreamClients() {
  if (!process.env.REDIS_URL) return null;

  if (!publisher) {
    publisher = createClient({ url: process.env.REDIS_URL });
  }
  if (!subscriber) {
    subscriber = createClient({ url: process.env.REDIS_URL });
  }

  return { publisher, subscriber };
}

// General-purpose key/value client shared by short-lived cache and cross-instance
// signaling use cases (X Wrapped cache, MCP elicitation handoff, rate limiting) —
// talks directly to REDIS_URL over RESP, no separate REST-protocol proxy needed.
let kvClient: IORedis | null = null;
export function getKVRedisClient(): IORedis | null {
  if (!process.env.REDIS_URL) return null;
  if (!kvClient) {
    kvClient = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  }
  return kvClient;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const client = getKVRedisClient();
  if (!client) return null;
  const raw = await client.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
  const client = getKVRedisClient();
  if (!client) return;
  const raw = JSON.stringify(value);
  if (opts?.ex) {
    await client.set(key, raw, 'EX', opts.ex);
  } else {
    await client.set(key, raw);
  }
}

export async function kvDel(...keys: string[]): Promise<void> {
  const client = getKVRedisClient();
  if (!client || keys.length === 0) return;
  await client.del(...keys);
}

export async function kvExists(key: string): Promise<boolean> {
  const client = getKVRedisClient();
  if (!client) return false;
  const count = await client.exists(key);
  return count > 0;
}
