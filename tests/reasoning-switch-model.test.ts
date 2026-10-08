import { describe, it, expect } from 'vitest';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { reasoningSwitch, withReasoningSwitch } from '@/ai/reasoning-switch-model';

function replyingModel(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe('reasoningSwitch', () => {
  const model = reasoningSwitch({ thinking: replyingModel('thinking'), instant: replyingModel('instant') });

  it('uses the thinking model when no effort flag is set', async () => {
    expect((await generateText({ model, prompt: 'hi' })).text).toBe('thinking');
  });

  it('follows the reasoning-effort flag', async () => {
    const run = (thinking: boolean) =>
      generateText({ model, prompt: 'hi', providerOptions: withReasoningSwitch(thinking) });
    expect((await run(true)).text).toBe('thinking');
    expect((await run(false)).text).toBe('instant');
  });
});
