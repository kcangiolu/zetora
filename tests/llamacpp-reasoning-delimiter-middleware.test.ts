import { describe, it, expect } from 'vitest';
import { createReasoningDelimiterMiddleware } from '@/ai/native-models/reasoning-delimiter-middleware';

// Regression test for a real bug hit live against a running llama.cpp server
// (G4-MeroMero-v2-31B, Gemma4-based): deriveReasoningDelimiters captured
// close as "\n<channel|>" (the exact bytes a static template render happens
// to produce), but the model's real completion doesn't always emit the
// newline immediately before the tag — e.g. "...concepts.<channel|>The
// search results..." with no \n. The untrimmed delimiter never matched, so
// the stream never left reasoning mode: the entire real final answer (a
// full paragraph of French text) came out as reasoning-delta and zero
// text-delta chunks were ever emitted — the user's answer was silently
// swallowed into a hidden "Reasoning" section. See
// tests/llamacpp-reasoning-delimiters.test.ts for the now-trimmed delimiters
// this middleware is meant to receive.

async function collect(middleware: ReturnType<typeof createReasoningDelimiterMiddleware>, text: string) {
  const result = await middleware.wrapGenerate!({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop' },
      usage: {},
      warnings: [],
    }),
  } as never);
  return (result as { content: Array<{ type: string; text?: string }> }).content;
}

describe('createReasoningDelimiterMiddleware — close delimiter without the whitespace a template render happens to include', () => {
  it('still exits reasoning mode when the model omits the newline before the close tag', async () => {
    const middleware = createReasoningDelimiterMiddleware('<|channel>thought', '<channel|>', false);

    // No newline directly before <channel|> — the exact shape observed live.
    const text =
      '<|channel>thought\nThe user wants to know X. I should search for it.<channel|>Voici la réponse finale pour l’utilisateur.';

    const content = await collect(middleware, text);

    const reasoningParts = content.filter((p) => p.type === 'reasoning').map((p) => p.text).join('');
    const textParts = content.filter((p) => p.type === 'text').map((p) => p.text).join('');

    expect(reasoningParts).toContain('should search for it.');
    expect(textParts).toBe('Voici la réponse finale pour l’utilisateur.');
  });

  it('regression: the untrimmed delimiter (with a leading newline requirement) loses the final answer entirely', async () => {
    // Same middleware, but fed the delimiter exactly as deriveReasoningDelimiters
    // used to return it before trimming — demonstrates the bug this fix closes.
    const middleware = createReasoningDelimiterMiddleware('<|channel>thought\n', '\n<channel|>', false);

    const text =
      '<|channel>thought\nThe user wants to know X. I should search for it.<channel|>Voici la réponse finale pour l’utilisateur.';

    const content = await collect(middleware, text);
    const textParts = content.filter((p) => p.type === 'text').map((p) => p.text).join('');

    // With the old, unwidened delimiter this is empty — the whole thing,
    // including the real answer, stays classified as reasoning.
    expect(textParts).toBe('');
  });
});
