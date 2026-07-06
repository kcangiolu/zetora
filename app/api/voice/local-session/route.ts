import { withAuth } from '@/lib/api/route-handlers';
import { createVoiceSessionToken } from '@/lib/voice-session-token';

// Local equivalent of the xAI /session ephemeral-token endpoint: mints a
// short-lived token the browser hands to the s2s-service over the /v1/realtime
// WebSocket, which the s2s-service then replays as a Bearer token when it
// calls back into /api/transcribe, /api/v1/chat/completions and
// /api/tts/stream on behalf of this user.
// Plain server env (not NEXT_PUBLIC_*): the browser learns this URL from the
// JSON response below, not from the client bundle, so no build-time baking
// or rebuild-on-change coupling is needed.
const S2S_URL = process.env.VOICE_S2S_URL || 'ws://localhost:8100/v1/realtime';

export const POST = withAuth(async (_req, { user }) => {
  const token = createVoiceSessionToken(user.id);

  return Response.json({
    token,
    url: S2S_URL,
    expiresIn: 600,
  });
});
