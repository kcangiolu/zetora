import { withAuth } from '@/lib/api/route-handlers';
import { getCustomModels, getCustomProviders } from '@/lib/custom-providers';
import { getReasoningCapability } from '@/lib/reasoning-effort';

export const GET = withAuth(async () => {
  const [customModels, customProviders] = await Promise.all([getCustomModels(), getCustomProviders()]);
  const models = customModels.map((m) => ({
    value: m.id,
    label: m.label,
    description: `Custom model via ${m.providerId}`,
    vision: m.vision,
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
    // Decoupled from `reasoning` above (which drives the brain badge for
    // known reasoning models) — this drives which reasoning-effort toggle
    // the composer shows for this model.
    reasoningControl: getReasoningCapability(m.id, customProviders),
  }));

  return Response.json({ models });
});
