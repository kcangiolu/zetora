import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_transcribe as transcribe } from 'ai';
import { withError } from '@/lib/api/route-handlers';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';

// The s2s-service (local voice backend) authenticates via a Bearer
// voice-session token instead of a cookie, but a session is required either way.
export const POST = withError(async (request) => {
  const userId = await resolveVoiceRequestUserId(request);
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get('audio');

  if (!audio || !(audio instanceof Blob)) {
    return Response.json({ error: 'No audio file found in form data.' }, { status: 400 });
  }

  const prefs = await getCachedUserPreferencesByUserId(userId).catch(() => null);
  const p = prefs?.preferences ?? {};
  const sttProvider = p['zetora-stt-provider'] || 'elevenlabs';

  if (sttProvider === 'openai-compatible') {
    const customProviders = (p['zetora-custom-providers'] ?? []) as Array<{
      id: string;
      baseURL: string;
      apiKey?: string;
    }>;
    const providerId = p['zetora-stt-custom-provider-id'] as string | undefined;
    const customProvider = customProviders.find((cp) => cp.id === providerId);
    const baseUrl = customProvider?.baseURL || 'http://localhost:9002/v1';
    const apiKey = customProvider?.apiKey || 'not-needed';
    const model = (p['zetora-stt-openai-model'] as string) || 'whisper-1';

    const sttForm = new FormData();
    sttForm.append('file', audio, 'audio.webm');
    sttForm.append('model', model);

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: sttForm,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'Unknown error');
      return Response.json({ error: `STT server error (${response.status}): ${errBody}` }, { status: 502 });
    }

    const data = await response.json();
    return Response.json({ text: data.text ?? '' });
  }

  // Fallback: ElevenLabs Scribe
  const result = await transcribe({
    model: elevenlabs.transcription('scribe_v2'),
    audio: await audio.arrayBuffer(),
  });

  return Response.json({ text: result.text });
});
