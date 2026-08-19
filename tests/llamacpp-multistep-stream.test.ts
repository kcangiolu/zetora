import { describe, it, expect } from 'vitest';
import { streamText, wrapLanguageModel, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { LlamaCppNativeLanguageModel } from '@/ai/native-models/llamacpp-model';
import { dynamicXmlToolMiddleware } from '@/ai/xml-tool-middleware';
import { llamaCppReasoningMaskMiddleware } from '@/lib/reasoning-effort';
import { dropBenignTextPartErrors } from '@/lib/search/benign-stream-errors';

// Regression test for a real bug hit live: a llama.cpp custom model with
// reasoning + a mid-turn tool call produced a "text part <id> not found"
// error chunk client-side, which useChat treats as fatal — the browser gave
// up and showed "No response generated" while the model kept generating in
// the background server-side. See lib/search/benign-stream-errors.ts.

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        await new Promise((r) => setTimeout(r, 0));
      }
      controller.close();
    },
  });
}

// Realistic raw llama.cpp completions: no literal opening <think> (the chat
// template prefills it into the rendered prompt), a tool call mid-turn, then
// a second reasoning + answer pass after the tool result comes back.
const step1Chunks = [
  'Let me plan the search.\n',
  'I will call web_search. ',
  '</think>\n',
  '<web_search>\n<queries>\n<item>travailler efficacement 2026</item>\n</queries>\n</web_search>',
];
const step2Chunks = [
  "J'ai les résultats.\n",
  'Je vais maintenant répondre. ',
  '</think>\n',
  "Voici comment travailler efficacement en 2026 : d'abord...",
];

function makeFetch() {
  let callCount = 0;
  return async (url: string | URL) => {
    const href = url.toString();
    if (href.endsWith('/props')) {
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.endsWith('/completion')) {
      callCount += 1;
      const chunks = callCount === 1 ? step1Chunks : step2Chunks;
      const events = chunks.map((c, i) => ({
        content: c,
        stop: i === chunks.length - 1,
        stopped_eos: i === chunks.length - 1,
        tokens_predicted: chunks.length,
        tokens_evaluated: 10,
      }));
      return new Response(sseStream(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    throw new Error(`unexpected fetch to ${href}`);
  };
}

describe('llama.cpp multi-step turn through the real middleware chain (same order as app/api/search/route.ts)', () => {
  it('client-facing UI stream has zero error chunks and delivers the final answer', async () => {
    const base = new LlamaCppNativeLanguageModel('qwen3', {
      providerId: 'llama',
      rootURL: 'http://llama-generate.test',
      fetch: makeFetch() as unknown as typeof fetch,
    });

    // Same wrapping order as ai/providers.ts::resolveModel + route.ts: XML
    // tool middleware first, reasoning mask outermost.
    const xmlWrapped = wrapLanguageModel({ model: base, middleware: dynamicXmlToolMiddleware });
    const fullyWrapped = wrapLanguageModel({ model: xmlWrapped, middleware: llamaCppReasoningMaskMiddleware });

    const result = streamText({
      model: fullyWrapped,
      prompt: 'Comment travailler efficacement en 2026 ?',
      stopWhen: stepCountIs(4),
      tools: {
        web_search: tool({
          description: 'Search the web',
          inputSchema: z.object({ queries: z.array(z.string()) }),
          execute: async ({ queries }) => ({ results: queries.map((q) => ({ query: q, snippets: ['fake result'] })) }),
        }),
      },
    });

    const uiStream = result.toUIMessageStream({ sendReasoning: true, sendSources: true });
    const filtered = dropBenignTextPartErrors(uiStream);

    const reader = filtered.getReader();
    const chunks: Array<{ type: string; errorText?: string; delta?: string }> = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as { type: string; errorText?: string; delta?: string });
    }

    const errorChunks = chunks.filter((c) => c.type === 'error');
    expect(errorChunks).toEqual([]);

    const finalText = chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(finalText).toContain('Voici comment travailler efficacement');

    expect(chunks.at(-1)?.type).toBe('finish');
  });
});
