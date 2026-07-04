import { NextRequest } from 'next/server';
import { getUser } from '@/lib/auth-utils';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';

export async function POST(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { text } = await req.json();
  if (!text || typeof text !== 'string') {
    return new Response('Missing text', { status: 400 });
  }

  const prefs = await getCachedUserPreferencesByUserId(user.id).catch(() => null);
  const p = prefs?.preferences ?? {};
  const ttsProvider = p['zetora-tts-provider'] || 'elevenlabs';

  if (ttsProvider !== 'openai-compatible') {
    return new Response('Streaming only supported for custom TTS providers', { status: 400 });
  }

  const customProviders = (p['zetora-custom-providers'] ?? []) as Array<{
    id: string;
    name: string;
    baseURL: string;
    apiKey?: string;
  }>;
  const providerId = p['zetora-tts-custom-provider-id'] as string | undefined;
  const provider = customProviders.find((cp) => cp.id === providerId);

  if (!provider?.baseURL) {
    return new Response('Custom TTS provider not configured', { status: 400 });
  }

  const voice = (p['zetora-tts-openai-voice'] as string) || 'alloy';
  const language = (p['zetora-tts-openai-language'] as string) || undefined;

  const base = provider.baseURL.endsWith('/v1')
    ? provider.baseURL
    : `${provider.baseURL}/v1`;
  const upstreamUrl = `${base}/audio/speech`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  const body: Record<string, string> = { model: 'tts-1', input: text, voice, response_format: 'pcm' };
  if (language) body.language = language;

  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
