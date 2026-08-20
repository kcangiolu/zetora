import { withAuth } from '@/lib/api/route-handlers';
import { getCustomModels, getCustomProviders, shouldUseNativeCustomProvider } from '@/lib/custom-providers';
import { getReasoningCapability } from '@/lib/reasoning-effort';

export const GET = withAuth(async () => {
  const [customModels, customProviders] = await Promise.all([getCustomModels(), getCustomProviders()]);
  const models = customModels.map((m) => {
    const provider = customProviders.find((p) => p.id === m.providerId);
    // A llamacpp/ollama provider without enrichedShim routes text turns
    // through the native /completion or /api/chat endpoint, which cannot
    // carry images — attaching one silently bounces just that turn to the
    // OpenAI-compatible shim (shouldUseNativeCustomProvider), dropping any
    // native-only prefill/grammar/sampling config for it. Report vision as
    // unsupported here so the composer's toggle doesn't advertise a
    // capability this provider's actual (pure) endpoint doesn't have.
    const usingNativeForText = shouldUseNativeCustomProvider(provider?.backendKind, provider?.enrichedShim, false);
    return {
      value: m.id,
      label: m.label,
      description: `Custom model via ${m.providerId}`,
      vision: m.vision && !usingNativeForText,
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
    };
  });

  return Response.json({ models });
});
