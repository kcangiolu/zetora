import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

import { createLogger } from '@/lib/logger';

const log = createLogger('bullmq');

const QUEUE_NAME = 'lookout-scheduler';
const PAUSED_KEY_PREFIX = 'bullmq:paused:';

export interface LookoutJobData {
  destination: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface PausedSchedulerData extends LookoutJobData {
  pattern: string;
}

// Returns plain connection options so BullMQ uses its own bundled ioredis,
// avoiding a version mismatch between ioredis@5.10.x (project) and 5.11.x (BullMQ).
function getConnectionOpts() {
  const rawUrl = process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
  const password = process.env.BULLMQ_REDIS_PASSWORD || undefined;
  const url = new URL(rawUrl);
  return {
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '6379', 10),
    password: password || url.password || undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

// Separate ioredis client used only for pause/resume state — never passed to BullMQ.
let _stateRedis: Redis | null = null;
function getStateRedis(): Redis {
  if (!_stateRedis) {
    const rawUrl = process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
    const password = process.env.BULLMQ_REDIS_PASSWORD || undefined;
    _stateRedis = new Redis(rawUrl, { password, maxRetriesPerRequest: null, enableReadyCheck: false });
  }
  return _stateRedis;
}

let _queue: Queue<LookoutJobData> | null = null;
function getQueue(): Queue<LookoutJobData> {
  if (!_queue) {
    _queue = new Queue<LookoutJobData>(QUEUE_NAME, { connection: getConnectionOpts() });
  }
  return _queue;
}

export async function createBullMqSchedule(params: {
  scheduleId: string;
  destination: string;
  cron: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<{ scheduleId: string }> {
  // QStash encodes timezone as "CRON_TZ=Europe/Paris 5 10 * * *".
  // BullMQ expects a bare cron pattern + a separate tz option.
  let cronPattern = params.cron;
  let tz: string | undefined;
  if (params.cron.startsWith('CRON_TZ=')) {
    const spaceIdx = params.cron.indexOf(' ');
    tz = params.cron.slice('CRON_TZ='.length, spaceIdx);
    cronPattern = params.cron.slice(spaceIdx + 1);
  }

  await getQueue().upsertJobScheduler(
    params.scheduleId,
    { pattern: cronPattern, tz },
    {
      name: 'lookout-execution',
      data: {
        destination: params.destination,
        body: params.body,
        headers: params.headers,
      },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    },
  );
  return { scheduleId: params.scheduleId };
}

export async function deleteBullMqSchedule(scheduleId: string): Promise<void> {
  await getQueue().removeJobScheduler(scheduleId);
  await getStateRedis().del(`${PAUSED_KEY_PREFIX}${scheduleId}`);
}

export async function pauseBullMqSchedule(scheduleId: string): Promise<void> {
  const queue = getQueue();
  const scheduler = await queue.getJobScheduler(scheduleId);
  if (!scheduler) return;

  const data = scheduler.template?.data;
  const state: PausedSchedulerData = {
    pattern: scheduler.pattern ?? '',
    destination: data?.destination ?? '',
    body: data?.body ?? {},
    headers: data?.headers,
  };

  await getStateRedis().set(`${PAUSED_KEY_PREFIX}${scheduleId}`, JSON.stringify(state));
  await queue.removeJobScheduler(scheduleId);
}

export async function resumeBullMqSchedule(scheduleId: string): Promise<void> {
  const redis = getStateRedis();
  const stored = await redis.get(`${PAUSED_KEY_PREFIX}${scheduleId}`);
  if (!stored) return;

  const state = JSON.parse(stored) as PausedSchedulerData;
  await createBullMqSchedule({
    scheduleId,
    destination: state.destination,
    cron: state.pattern,
    body: state.body,
    headers: state.headers,
  });

  await redis.del(`${PAUSED_KEY_PREFIX}${scheduleId}`);
}

export async function scheduleBullMqOnce(params: {
  destination: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  delayMs: number;
}): Promise<void> {
  await getQueue().add(
    'lookout-execution',
    { destination: params.destination, body: params.body, headers: params.headers },
    {
      delay: params.delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
}

export function startLookoutWorker(): Worker<LookoutJobData> {
  const worker = new Worker<LookoutJobData>(
    QUEUE_NAME,
    async (job: Job<LookoutJobData>) => {
      const { destination, body, headers } = job.data;

      const response = await fetch(destination, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Lookout fetch failed: ${response.status} ${response.statusText}`);
      }
    },
    { connection: getConnectionOpts() },
  );

  worker.on('failed', (job, err) => {
    log.error(`[BullMQ] Lookout job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  return worker;
}

// Extensions job registry — a separate queue from lookout-scheduler above,
// so a private overlay (see AGENT.md §2.3) can run its own background jobs
// without this worker ever being modified by non-public code. The overlay
// registers handlers by job name via its extensions.ts loader at boot,
// before startExtensionsWorker() runs; this file has zero knowledge of what
// any handler actually does.
const EXTENSIONS_QUEUE_NAME = 'extensions-tasks';
const jobHandlers = new Map<string, (job: Job) => Promise<void>>();

export function registerJobHandler(name: string, handler: (job: Job) => Promise<void>): void {
  jobHandlers.set(name, handler);
}

let _extensionsQueue: Queue | null = null;
export function getExtensionsQueue(): Queue {
  if (!_extensionsQueue) {
    _extensionsQueue = new Queue(EXTENSIONS_QUEUE_NAME, { connection: getConnectionOpts() });
  }
  return _extensionsQueue;
}

// No-op (returns null) if nothing registered a handler — an idle worker
// polling Redis for a queue no extension uses isn't worth running.
export function startExtensionsWorker(): Worker | null {
  if (jobHandlers.size === 0) return null;

  const worker = new Worker(
    EXTENSIONS_QUEUE_NAME,
    async (job: Job) => {
      const handler = jobHandlers.get(job.name);
      if (!handler) {
        log.warn(`[BullMQ] No handler registered for extensions job "${job.name}"`);
        return;
      }
      await handler(job);
    },
    { connection: getConnectionOpts() },
  );

  worker.on('failed', (job, err) => {
    log.error(`[BullMQ] Extensions job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  return worker;
}

function isBullMqEnabled(): boolean {
  return process.env.BULLMQ_ENABLED === 'true';
}

export function getLockoutProvider(preferences?: {
  'zetora-lockout-provider'?: 'qstash' | 'bullmq';
}): 'qstash' | 'bullmq' {
  if (preferences?.['zetora-lockout-provider']) {
    return preferences['zetora-lockout-provider'];
  }
  if (isBullMqEnabled()) {
    return 'bullmq';
  }
  return 'qstash';
}
