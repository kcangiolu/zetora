import { NextRequest } from 'next/server';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';
import { extractSpeakableText } from '@/lib/speakable-text';

// The s2s-service (local voice backend) authenticates via a Bearer
// voice-session token instead of a cookie.
export async function POST(req: NextRequest) {
  const userId = await resolveVoiceRequestUserId(req);
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { text: rawText } = await req.json();
  if (!rawText || typeof rawText !== 'string') {
    return new Response('Missing text', { status: 400 });
  }
  // Strips markdown/emoji the LLM may still emit (the s2s-service sends raw
  // sentence buffers) — a no-op for the "read aloud" caller, which already
  // pre-cleans its text with the same function client-side.
  const text = extractSpeakableText(rawText);
  if (!text) {
    return new Response(null, { status: 204 });
  }

  const prefs = await getCachedUserPreferencesByUserId(userId).catch(() => null);
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

  const base = provider.baseURL.endsWith('/v1') ? provider.baseURL : `${provider.baseURL}/v1`;
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
