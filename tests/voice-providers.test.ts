import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { resolveVoiceRequestUserId, getCachedUserPreferencesByUserId, getCustomProviderById, serverEnv } = vi.hoisted(
  () => ({
    resolveVoiceRequestUserId: vi.fn(),
    getCachedUserPreferencesByUserId: vi.fn(),
    getCustomProviderById: vi.fn(),
    serverEnv: { ELEVENLABS_API_KEY: 'placeholder' },
  }),
);

vi.mock('@/lib/voice-session-token', () => ({ resolveVoiceRequestUserId }));
vi.mock('@/lib/user-data-server', () => ({ getCachedUserPreferencesByUserId }));
vi.mock('@/lib/custom-providers', () => ({ getCustomProviderById }));
vi.mock('@/env/server', () => ({ serverEnv }));

import { POST as transcribe } from '@/app/api/transcribe/route';
import { POST as ttsStream } from '@/app/api/tts/stream/route';

const ctx = { params: Promise.resolve({}) };
const STT_SERVER = { id: 'stt-1', name: 'Parakeet', baseURL: 'http://stt.example.com/v1' };
const TTS_SERVER = { id: 'tts-1', name: 'Qwen3', baseURL: 'http://tts.example.com/v1' };

function prefs(preferences: Record<string, unknown>) {
  getCachedUserPreferencesByUserId.mockResolvedValue({ preferences });
}

function transcribeRequest(fileName: string) {
  const form = new FormData();
  form.append('audio', new File([new Uint8Array([1, 2, 3])], fileName, { type: 'audio/wav' }));
  return new Request('http://localhost/api/transcribe', { method: 'POST', body: form });
}

function ttsRequest(text = 'Hello there.') {
  return new Request('http://localhost/api/tts/stream', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }) as never;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  resolveVoiceRequestUserId.mockResolvedValue('user-1');
  getCustomProviderById.mockImplementation(async (id: string | undefined) =>
    [STT_SERVER, TTS_SERVER].find((provider) => provider.id === id),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/transcribe', () => {
  it('says to pick a server instead of falling back to localhost', async () => {
    prefs({ 'zetora-stt-provider': 'openai-compatible' });

    const response = await transcribe(transcribeRequest('audio.wav'), ctx);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Settings > Voice');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the uploaded file under its own name', async () => {
    prefs({ 'zetora-stt-provider': 'openai-compatible', 'zetora-stt-custom-provider-id': 'stt-1' });
    fetchMock.mockResolvedValue(Response.json({ text: 'bonjour' }));

    const response = await transcribe(transcribeRequest('audio.wav'), ctx);

    expect(await response.json()).toEqual({ text: 'bonjour' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://stt.example.com/v1/audio/transcriptions');
    expect((init.body as FormData).get('file')).toMatchObject({ name: 'audio.wav' });
  });

  it('names ELEVENLABS_API_KEY when ElevenLabs is chosen without a key', async () => {
    prefs({});

    const response = await transcribe(transcribeRequest('recording.webm'), ctx);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('ELEVENLABS_API_KEY');
  });
});

describe('POST /api/tts/stream', () => {
  it('says streaming needs a custom provider when ElevenLabs is chosen', async () => {
    prefs({});

    const response = await ttsStream(ttsRequest());

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Settings > Voice');
  });

  it('sends the model chosen in Settings', async () => {
    prefs({
      'zetora-tts-provider': 'openai-compatible',
      'zetora-tts-custom-provider-id': 'tts-1',
      'zetora-tts-openai-model': 'kokoro',
    });
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0, 0])));

    const response = await ttsStream(ttsRequest());

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://tts.example.com/v1/audio/speech');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'kokoro', response_format: 'pcm' });
  });

  it('names the server when it cannot be reached', async () => {
    prefs({ 'zetora-tts-provider': 'openai-compatible', 'zetora-tts-custom-provider-id': 'tts-1' });
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const response = await ttsStream(ttsRequest());

    expect(response.status).toBe(502);
    expect(await response.text()).toContain('Qwen3');
  });
});
