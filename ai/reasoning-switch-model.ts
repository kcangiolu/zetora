import type { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider';

// Some catalog models ship their thinking and instant behaviours as two
// separate upstream models (e.g. grok-4-fast-reasoning / -non-reasoning,
// Qwen3 Thinking / Instruct) with no parameter that switches between them.
// This model exposes them as one catalog entry and picks the upstream model
// per call from the reasoning-effort flag below, so the effort toggle can
// drive them like any parameter-controlled model.
//
// Callers set the flag through providerOptions (see withReasoningSwitch).
// It is absent wherever no effort applies, which means 'auto' — thinking on.
const OPTIONS_KEY = 'zetora';

export function withReasoningSwitch(thinking: boolean): { [OPTIONS_KEY]: { thinking: boolean } } {
  return { [OPTIONS_KEY]: { thinking } };
}

function wantsThinking(options: LanguageModelV3CallOptions): boolean {
  return options.providerOptions?.[OPTIONS_KEY]?.thinking !== false;
}

export function reasoningSwitch({
  thinking,
  instant,
}: {
  thinking: LanguageModelV3;
  instant: LanguageModelV3;
}): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: thinking.provider,
    modelId: thinking.modelId,
    // The two upstream models can accept different URL schemes; declaring
    // none makes the SDK download every attachment, which both accept.
    supportedUrls: {},
    doGenerate: (options) => (wantsThinking(options) ? thinking : instant).doGenerate(options),
    doStream: (options) => (wantsThinking(options) ? thinking : instant).doStream(options),
  };
}
