import { createClient } from 'redis';

import { createLogger } from '@/lib/logger';
import { REDIS_COMMAND_TIMEOUT_MS } from '@/lib/timeouts';

const log = createLogger('redis');

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

export type KeyValueRedisClient = ReturnType<typeof createClient>;

// A key/value client that connects in the background. Commands sent before it
// is ready, or while Redis is down, wait at most REDIS_COMMAND_TIMEOUT_MS and
// then fail, instead of hanging until Redis comes back.
export function createKeyValueRedisClient(url: string, options: { password?: string } = {}): KeyValueRedisClient {
  const client = createClient({
    url,
    password: options.password,
    commandOptions: { timeout: REDIS_COMMAND_TIMEOUT_MS },
  });
  // Without a listener, a connection error would crash the process.
  client.on('error', (error) => log.error('Redis connection error:', error));
  client.connect().catch((error) => log.error('Redis connection failed:', error));
  return client;
}

// General-purpose key/value client shared by short-lived cache and cross-instance
// signaling use cases (X Wrapped cache, MCP elicitation handoff, rate limiting) —
// talks directly to REDIS_URL over RESP, no separate REST-protocol proxy needed.
let kvClient: KeyValueRedisClient | null = null;
export function getKVRedisClient(): KeyValueRedisClient | null {
  if (!process.env.REDIS_URL) return null;
  kvClient ??= createKeyValueRedisClient(process.env.REDIS_URL);
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
  await client.set(key, raw, opts?.ex ? { expiration: { type: 'EX', value: opts.ex } } : undefined);
}

export async function kvDel(...keys: string[]): Promise<void> {
  const client = getKVRedisClient();
  if (!client || keys.length === 0) return;
  await client.del(keys);
}

export async function kvExists(key: string): Promise<boolean> {
  const client = getKVRedisClient();
  if (!client) return false;
  const count = await client.exists(key);
  return count > 0;
}
