import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from 'ai';

import { createReasoningDelimiterMiddleware } from '@/ai/native-models/reasoning-delimiter-middleware';
import { detectReasoningDelimiters } from '@/ai/native-models/llamacpp-prompt';
import { deriveRootURL, getCustomProviders, parseCustomModelId } from '@/lib/custom-providers';
import {
  dropReasoningPartsMiddleware,
  getCustomProviderOptions,
  llamaCppReasoningMaskMiddleware,
  reasoningMaskMiddleware,
} from '@/lib/reasoning-effort';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';

// A custom provider's model with its reasoning setting applied. getSearchProviderOptions
// only knows the catalog's providers: vLLM, llama.cpp and Ollama backends get native
// control params, others can only have their <think> output hidden by middleware.
export async function applyCustomModelReasoning({
  model,
  resolvedModel,
  effort,
  userId,
  hasImages,
}: {
  model: string;
  resolvedModel: LanguageModel;
  effort: ReasoningEffort;
  userId: string | undefined;
  hasImages: boolean;
}): Promise<{ model: LanguageModel; providerOptions: Record<string, unknown> }> {
  const customProviders = await getCustomProviders(userId);
  const overrides = getCustomProviderOptions(model, effort, customProviders, hasImages);
  if (!overrides.applyMaskMiddleware) return { model: resolvedModel, providerOptions: overrides.providerOptions };

  // llama.cpp's chat template prefills the opening <think> into the prompt, so the
  // completion starts inside reasoning: without the startWithReasoning variant the
  // closing </think> would show as text. Only on the native path; a provider demoted to
  // the shim (enriched shim, image turn) never gets this prompt shape.
  let middleware: LanguageModelMiddleware = reasoningMaskMiddleware;
  if (overrides.usingNative && overrides.backendKind === 'llamacpp') {
    // The native /completion endpoint never splits reasoning out: the model's own chat
    // template tells its real reasoning delimiters. Unrecognized templates keep the
    // generic <think> mask.
    const parsed = parseCustomModelId(model, customProviders);
    const delimiters = parsed ? await detectReasoningDelimiters(deriveRootURL(parsed.provider.baseURL)) : null;
    middleware = delimiters
      ? createReasoningDelimiterMiddleware(delimiters.open, delimiters.close, delimiters.startsInReasoning)
      : llamaCppReasoningMaskMiddleware;
  }
  // Structured reasoning_content passes through extractReasoningMiddleware untouched
  // (see dropReasoningPartsMiddleware): an explicit 'off' drops it too.
  const middlewares: LanguageModelMiddleware[] =
    effort === 'off' ? [middleware, dropReasoningPartsMiddleware] : [middleware];

  return {
    model: wrapLanguageModel({
      model: resolvedModel as Extract<LanguageModel, { specificationVersion: 'v3' }>,
      middleware: middlewares,
    }),
    providerOptions: overrides.providerOptions,
  };
}
