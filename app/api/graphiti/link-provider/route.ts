import { z } from 'zod';
import { parseBody, withAuth } from '@/lib/api/route-handlers';
import { getCustomProviders } from '@/lib/custom-providers';
import { GRAPHITI_BASE_URL } from '@/lib/graphiti/config';

const LinkSchema = z.object({
  providerId: z.string(),
  target: z.enum(['llm', 'embedding', 'small_llm']),
  modelName: z.string().optional(),
});

// Links a saved custom AI provider to the Graphiti service as its LLM or
// embedding backend. The provider's API key is decrypted server-side and
// forwarded straight to Graphiti — it never needs to round-trip through the
// browser the way it would if the client assembled the /config payload itself.
export const POST = withAuth(async (req, { user }) => {
  const { providerId, target, modelName } = await parseBody(req, LinkSchema);

  const providers = await getCustomProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return Response.json({ error: 'Provider not found' }, { status: 404 });
  }

  const baseUrl = GRAPHITI_BASE_URL;
  // small_llm intentionally omits api_key/base_url: graphiti_core's LLMConfig
  // has a single client (one api_key/base_url) with two model names on it, so
  // the small model must live on the same provider already linked as 'llm'.
  const payload =
    target === 'llm'
      ? { llm_model: modelName ?? null, llm_api_key: provider.apiKey || null, llm_base_url: provider.baseURL || null }
      : target === 'small_llm'
        ? { small_llm_model: modelName ?? null }
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
      return Response.json({ error: `Graphiti service error (${res.status})` }, { status: 502 });
    }
  } catch {
    return Response.json({ error: 'Could not reach Graphiti service' }, { status: 502 });
  }

  return Response.json({ success: true });
});
