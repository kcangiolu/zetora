import { z } from 'zod';
import { parseBody, withAuth } from '@/lib/api/route-handlers';
import { detectModels, detectBackendKind } from '@/lib/custom-providers';

// Fetches an arbitrary user-supplied baseURL server-side, so require a
// session to keep it from being used as an unauthenticated SSRF probe.
const DetectSchema = z.object({
  baseURL: z.string().url('baseURL must be a valid URL'),
  apiKey: z.string().optional(),
});

export const POST = withAuth(async (req) => {
  const { baseURL, apiKey } = await parseBody(req, DetectSchema);

  try {
    const [models, backendKind] = await Promise.all([detectModels(baseURL, apiKey), detectBackendKind(baseURL)]);
    return Response.json({ models, backendKind });
  } catch (error) {
    return Response.json({ error: `Failed to detect models: ${(error as Error).message}` }, { status: 500 });
  }
});
