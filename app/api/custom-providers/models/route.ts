import { withAuth } from '@/lib/api/route-handlers';
import { getCustomModels } from '@/lib/custom-providers';

export const GET = withAuth(async () => {
  const customModels = await getCustomModels();
  const models = customModels.map((m) => ({
    value: m.id,
    label: m.label,
    description: `Custom model via ${m.providerId}`,
    vision: false,
    reasoning: false,
    experimental: false,
    category: 'Free',
    pdf: false,
    pro: false,
    requiresAuth: false,
    freeUnlimited: true,
    maxOutputTokens: 16000,
    provider: 'custom',
    customProviderId: m.providerId,
    customProviderName: m.providerName,
    isNew: true,
  }));

  return Response.json({ models });
});
