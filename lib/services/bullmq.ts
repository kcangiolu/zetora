import { Queue, Worker, Job } from 'bullmq';

import { serverEnv } from '@/env/server';
import { createLogger } from '@/lib/logger';
import { parseLookoutRunRequest, type LookoutRunRequest } from '@/lib/lookout/schedule';

const log = createLogger('bullmq');

const QUEUE_NAME = 'lookout-scheduler';

// Runs happen inside the worker and last minutes: a few at once keep one long
// run from holding up the others.
const WORKER_CONCURRENCY = 4;

// A run records its own failures, so a retry only covers a run that could not
// start (the database briefly unreachable). Finished jobs are dropped: the
// lookout keeps its run history.
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 100,
} as const;

// Plain connection options: BullMQ connects with its own bundled ioredis.
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

let _queue: Queue<unknown> | null = null;
function getQueue(): Queue<unknown> {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: getConnectionOpts() });
  }
  return _queue;
}

// Creates or replaces a recurring schedule. `cron` is a recurringCron
// schedule, "CRON_TZ=Europe/Paris 5 10 * * *"; BullMQ takes the timezone apart.
export async function createBullMqSchedule(params: {
  scheduleId: string;
  cron: string;
  request: LookoutRunRequest;
}): Promise<{ scheduleId: string }> {
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
    { name: 'lookout-execution', data: params.request, opts: JOB_OPTIONS },
  );
  return { scheduleId: params.scheduleId };
}

export async function deleteBullMqSchedule(scheduleId: string): Promise<void> {
  await getQueue().removeJobScheduler(scheduleId);
}

export async function scheduleBullMqOnce(params: { request: LookoutRunRequest; delayMs: number }): Promise<void> {
  await getQueue().add('lookout-execution', params.request, { ...JOB_OPTIONS, delay: params.delayMs });
}

// Job schedulers keep the template they were created with, and older ones
// wrap the request in `body` next to an HTTP destination.
function readJobRequest(data: unknown): LookoutRunRequest | null {
  const payload = typeof data === 'object' && data !== null && 'body' in data ? data.body : data;
  return parseLookoutRunRequest(payload);
}

export function startLookoutWorker(): Worker<unknown> {
  const worker = new Worker<unknown>(
    QUEUE_NAME,
    async (job: Job<unknown>) => {
      const request = readJobRequest(job.data);
      if (!request) {
        log.error(`[BullMQ] Job ${job.id} names no lookout:`, job.data);
        return;
      }
      // Loaded on first run: the run pulls in the models and search tools.
      const { runLookout } = await import('@/lib/lookout/run');
      await runLookout(request);
    },
    { connection: getConnectionOpts(), concurrency: WORKER_CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    log.error(`[BullMQ] Lookout job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  return worker;
}

// Where Lookouts are scheduled, chosen for the whole instance by
// LOOKOUT_SCHEDULER: 'bullmq' (the bundled Redis + worker) or 'qstash'
// (Upstash's cloud, for hosts without a long-running process).
export function getLookoutScheduler(): 'qstash' | 'bullmq' {
  switch (serverEnv.LOOKOUT_SCHEDULER) {
    case 'bullmq':
      return 'bullmq';
    case 'qstash':
      if (!serverEnv.QSTASH_TOKEN) {
        throw new Error('Lookouts: LOOKOUT_SCHEDULER=qstash needs QSTASH_TOKEN (see .env.example)');
      }
      return 'qstash';
    default:
      throw new Error('Lookouts are not configured: set LOOKOUT_SCHEDULER to bullmq or qstash (see .env.example)');
  }
}
