import { z } from 'zod';
import { parseBody, withAuth } from '@/lib/api/route-handlers';
import { getCustomProviders, saveCustomProviders, toClientSafeProviders } from '@/lib/custom-providers';

export const GET = withAuth(async () => {
  const providers = await getCustomProviders();
  return Response.json({ providers: toClientSafeProviders(providers) });
});

// hasApiKey is the GET-only projection some clients round-trip back;
// saveCustomProviders strips it before persisting.
const SaveSchema = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      baseURL: z.string(),
      apiKey: z.string().optional(),
      disableAutoDetect: z.boolean().optional(),
      anonymize: z.boolean().optional(),
      backendKind: z.enum(['ollama', 'vllm', 'llamacpp', 'openai', 'unknown']).optional(),
      enrichedShim: z.boolean().optional(),
      hasApiKey: z.unknown().optional(),
    }),
  ),
});

export const POST = withAuth(async (req) => {
  const { providers } = await parseBody(req, SaveSchema);
  await saveCustomProviders(providers);
  return Response.json({ success: true });
});
