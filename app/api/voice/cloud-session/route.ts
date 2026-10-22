import { z } from 'zod';
import { isConfigured } from '@/ai/catalog/env';
import { serverEnv } from '@/env/server';
import { withAuth } from '@/lib/api/route-handlers';
import { ChatSDKError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';

const log = createLogger('voice-cloud-session');

const TOKEN_TTL_SECONDS = 300;

const clientSecretSchema = z.object({ value: z.string().min(1) });

// Mints a short-lived xAI Realtime token: the browser opens the realtime
// WebSocket to xAI itself, so it must never see XAI_API_KEY.
export const POST = withAuth(async () => {
  if (!isConfigured(serverEnv.XAI_API_KEY)) {
    throw new ChatSDKError('bad_request:api', 'Cloud voice needs XAI_API_KEY to be set on this instance');
  }

  const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${serverEnv.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expires_after: { seconds: TOKEN_TTL_SECONDS } }),
  });

  if (!response.ok) {
    // xAI's error body names the team and its billing state: logged, not sent to the user.
    log.error(`xAI refused a realtime token (${response.status}): ${await response.text().catch(() => '')}`);
    throw new ChatSDKError(
      'bad_request:api',
      `xAI refused the voice session (${response.status}). The server log has the details.`,
    );
  }

  const secret = clientSecretSchema.parse(await response.json());
  return Response.json({ token: secret.value });
});
