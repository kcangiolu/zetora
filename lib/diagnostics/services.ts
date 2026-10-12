import 'server-only';

import { sql } from 'drizzle-orm';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import { db } from '@/lib/db';
import { getStorageClient } from '@/lib/storage';
import { getCatalogStatus, refreshModelCatalog } from '@/ai/catalog/store';

import { serverEnv } from '@/env/server';

interface ServiceCheckResult {
  ok: boolean;
  detail?: string;
}

export interface ServiceCheckDefinition {
  id: string;
  label: string;
  configured: () => boolean;
  run: () => Promise<ServiceCheckResult>;
}

const TIMEOUT_MS = 5000;

async function fetchOk(url: string, init?: RequestInit): Promise<ServiceCheckResult> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Request failed' };
  }
}

// fastCRW and s2s-service don't expose a health route the app can rely on —
// any HTTP response (even 404) proves the DNS name resolves and the port
// accepts connections, which is what actually breaks after a fresh
// `docker compose up` (wrong service name, container not started yet, etc).
async function fetchReachable(url: string): Promise<ServiceCheckResult> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: true, detail: `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Request failed' };
  }
}

async function redisPing(rawUrl: string, password?: string): Promise<ServiceCheckResult> {
  const client = new Redis(rawUrl, {
    password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: TIMEOUT_MS,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG' ? { ok: true } : { ok: false, detail: `Unexpected reply: ${pong}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Connection failed' };
  } finally {
    client.disconnect();
  }
}

// Every service the app itself talks to over the Docker network, in the same
// shape the "Diagnostics" settings tab renders as one row + test button per
// entry. `configured()` hides rows for services the deployment intentionally
// dropped (see the docker-compose.yml header comment on optional services).
export const SERVICE_CHECKS: ServiceCheckDefinition[] = [
  {
    id: 'postgres',
    label: 'PostgreSQL',
    configured: () => true,
    run: async () => {
      try {
        await db.execute(sql`select 1`);
        return { ok: true };
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'Query failed' };
      }
    },
  },
  {
    id: 'redis',
    label: 'Redis (cache)',
    configured: () => serverEnv.REDIS_URL !== 'placeholder',
    run: () => redisPing(serverEnv.REDIS_URL),
  },
  {
    id: 'storage',
    label: 'Object storage (S3)',
    configured: () => Boolean(process.env.S3_ENDPOINT),
    run: async () => {
      try {
        const { client: storageClient, bucketName: storageBucket } = getStorageClient();
        await storageClient.send(new HeadBucketCommand({ Bucket: storageBucket }));
        return { ok: true };
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'HeadBucket failed' };
      }
    },
  },
  {
    id: 'qdrant',
    label: 'Qdrant',
    configured: () => Boolean(serverEnv.QDRANT_URL),
    run: () => fetchOk(`${serverEnv.QDRANT_URL}/healthz`),
  },
  {
    id: 'searxng',
    label: 'SearXNG',
    configured: () => Boolean(serverEnv.SEARXNG_URL),
    run: () => fetchOk(`${serverEnv.SEARXNG_URL}/healthz`),
  },
  {
    id: 'fastcrw',
    label: 'fastCRW',
    configured: () => Boolean(serverEnv.FASTCRW_URL),
    run: () => fetchReachable(serverEnv.FASTCRW_URL!),
  },
  {
    id: 'sandbox',
    label: 'Code sandbox',
    configured: () => serverEnv.SANDBOX_PROVIDER === 'docker',
    run: () => fetchOk(`${serverEnv.DOCKER_SANDBOX_URL}/health`),
  },
  {
    id: 'presidio',
    label: 'Presidio (anonymizer)',
    configured: () => true,
    run: () => fetchOk(`${serverEnv.ANONYMIZER_API_URL}/health`),
  },
  {
    id: 'bullmq',
    label: 'BullMQ Redis (lookouts)',
    configured: () => serverEnv.LOOKOUT_SCHEDULER === 'bullmq',
    run: () =>
      redisPing(process.env.BULLMQ_REDIS_URL || 'redis://localhost:6381', process.env.BULLMQ_REDIS_PASSWORD),
  },
  {
    id: 's2s',
    label: 'Voice (s2s-service)',
    // Not VOICE_S2S_URL: that's deliberately the public browser-facing WS
    // address (docker-compose.yml sets it from .env for the client to
    // connect to directly) — unreachable, or wrong, from inside this
    // process. S2S_SERVICE_URL defaults to the local-dev host port and is
    // overridden to the Docker service name in docker-compose.yml for prod.
    configured: () => true,
    run: () => fetchOk(`${serverEnv.S2S_SERVICE_URL}/health`),
  },
  {
    id: 'model-catalog',
    label: 'Model catalog (models.dev)',
    configured: () => true,
    // Testing it refreshes it: new models show up without waiting a day.
    run: async () => {
      await refreshModelCatalog();
      const { modelCount, fetchedAt, lastError } = getCatalogStatus();
      if (lastError) return { ok: false, detail: lastError };
      return { ok: modelCount > 0, detail: `${modelCount} models, updated ${fetchedAt?.toISOString() ?? 'never'}` };
    },
  },
];
