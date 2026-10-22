import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_transcribe as transcribe } from 'ai';
import { isConfigured } from '@/ai/catalog/env';
import { serverEnv } from '@/env/server';
import { withError } from '@/lib/api/route-handlers';
import { getCustomProviderById } from '@/lib/custom-providers';
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

  const prefs = await getCachedUserPreferencesByUserId(userId);
  const p = prefs?.preferences ?? {};
  const sttProvider = p['zetora-stt-provider'] || 'elevenlabs';

  if (sttProvider === 'openai-compatible') {
    const customProvider = await getCustomProviderById(p['zetora-stt-custom-provider-id'], userId);
    if (!customProvider?.baseURL) {
      return Response.json(
        { error: 'No speech-to-text server selected: pick one under Settings > Voice > Speech-to-Text' },
        { status: 400 },
      );
    }
    const model = p['zetora-stt-openai-model'] || 'whisper-1';

    const sttForm = new FormData();
    // Servers that pick the decoder from the file name need the real one:
    // dictation records webm or mp4, s2s-service sends wav.
    sttForm.append('file', audio, audio instanceof File && audio.name ? audio.name : 'audio.webm');
    sttForm.append('model', model);

    const response = await fetch(`${customProvider.baseURL}/audio/transcriptions`, {
      method: 'POST',
      headers: customProvider.apiKey ? { Authorization: `Bearer ${customProvider.apiKey}` } : {},
      body: sttForm,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'Unknown error');
      return Response.json({ error: `STT server error (${response.status}): ${errBody}` }, { status: 502 });
    }

    const data = await response.json();
    return Response.json({ text: data.text ?? '' });
  }

  if (!isConfigured(serverEnv.ELEVENLABS_API_KEY)) {
    return Response.json(
      {
        error:
          'ElevenLabs transcription needs ELEVENLABS_API_KEY on this instance, or pick a custom server under Settings > Voice',
      },
      { status: 400 },
    );
  }

  const result = await transcribe({
    model: elevenlabs.transcription('scribe_v2'),
    audio: await audio.arrayBuffer(),
  });

  return Response.json({ text: result.text });
});
