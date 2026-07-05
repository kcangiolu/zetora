import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth-utils';
import { getCustomProviders } from '@/lib/custom-providers';
import { resolveGraphitiBaseUrl } from '@/lib/graphiti/config';

// Links a saved custom AI provider to the Graphiti service as its LLM or
// embedding backend. The provider's API key is decrypted server-side and
// forwarded straight to Graphiti — it never needs to round-trip through the
// browser the way it would if the client assembled the /config payload itself.
export async function POST(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const providerId = body?.providerId;
  const target = body?.target;
  const modelName = body?.modelName;

  if (typeof providerId !== 'string' || (target !== 'llm' && target !== 'embedding')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (modelName !== undefined && typeof modelName !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const providers = await getCustomProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  const baseUrl = await resolveGraphitiBaseUrl(user.id);
  const payload =
    target === 'llm'
      ? { llm_model: modelName ?? null, llm_api_key: provider.apiKey || null, llm_base_url: provider.baseURL || null }
      : {
          embedding_model: modelName ?? null,
          embedding_api_key: provider.apiKey || null,
          embedding_base_url: provider.baseURL || null,
        };

  try {
    const res = await fetch(`${baseUrl}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Graphiti service error (${res.status})` }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: 'Could not reach Graphiti service' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
