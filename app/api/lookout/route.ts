import { getLookoutScheduler } from '@/lib/services/bullmq';
import { createLogger } from '@/lib/logger';
import { verifyLookoutRequest } from '@/lib/lookout-auth';
import { runLookout } from '@/lib/lookout/run';
import { parseLookoutRunRequest } from '@/lib/lookout/schedule';

const log = createLogger('lookout');

// Runs one lookout when QStash calls back. With BullMQ the worker runs
// lookouts in-process and this endpoint is closed.
export async function POST(req: Request) {
  if (getLookoutScheduler() !== 'qstash') return new Response('Not found', { status: 404 });

  // Only the scheduler, holding the shared secret, may run jobs as a lookout's owner.
  const verification = verifyLookoutRequest(req);
  if (!verification.ok) return new Response(verification.message, { status: verification.status });

  const request = parseLookoutRunRequest(await req.json());
  if (!request) return new Response('Missing lookoutId', { status: 400 });

  try {
    // Answered once the run is over, which keeps a serverless host alive for it.
    return new Response(await runLookout(request), { status: 200 });
  } catch (error) {
    // The run never started: a 500 lets QStash retry it.
    log.error('Error in lookout API:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
