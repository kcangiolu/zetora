import { NextRequest } from 'next/server';
import { getCustomProviderById } from '@/lib/custom-providers';
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

  const prefs = await getCachedUserPreferencesByUserId(userId);
  const p = prefs?.preferences ?? {};
  const ttsProvider = p['zetora-tts-provider'] || 'elevenlabs';

  if (ttsProvider !== 'openai-compatible') {
    return new Response(
      'Streaming speech needs a Custom (OpenAI-compatible) Text-to-Speech provider: pick one under Settings > Voice',
      { status: 400 },
    );
  }

  const provider = await getCustomProviderById(p['zetora-tts-custom-provider-id'], userId);
  if (!provider?.baseURL) {
    return new Response('No text-to-speech server selected: pick one under Settings > Voice > Text-to-Speech', {
      status: 400,
    });
  }

  // Same defaults as Settings > Voice and the non-streaming read-aloud.
  const model = p['zetora-tts-openai-model'] || 'qwen3-tts';
  const voice = p['zetora-tts-openai-voice'] || 'af_bella';
  const language = p['zetora-tts-openai-language'] || undefined;

  const base = provider.baseURL.endsWith('/v1') ? provider.baseURL : `${provider.baseURL}/v1`;
  const upstreamUrl = `${base}/audio/speech`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  const body: Record<string, string> = { model, input: text, voice, response_format: 'pcm' };
  if (language) body.language = language;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const reason = error instanceof Error ? error.message : String(error);
    return new Response(`Text-to-speech server ${provider.name} is unreachable: ${reason}`, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return new Response(`Text-to-speech server ${provider.name} answered ${upstream.status}: ${detail.slice(0, 200)}`, {
      status: 502,
    });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
