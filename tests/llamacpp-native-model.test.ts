import { describe, it, expect, vi } from 'vitest';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { LlamaCppNativeLanguageModel } from '@/ai/native-models/llamacpp-model';

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
}

// No chat_template on /props, so every test renders through the generic
// ChatML fallback — keeps the expected prompt string simple and stable.
function makeFetch(completion: (body: Record<string, unknown>) => Response) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = url.toString();
    if (href.endsWith('/props')) {
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.endsWith('/completion')) {
      const body = JSON.parse(init!.body as string) as Record<string, unknown>;
      return completion(body);
    }
    throw new Error(`unexpected fetch to ${href}`);
  });
}

function callOptions(overrides: Partial<LanguageModelV3CallOptions> = {}): LanguageModelV3CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Say hi' }] }],
    ...overrides,
  };
}

async function collect(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const reader = stream.getReader();
  const parts: LanguageModelV3StreamPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

describe('LlamaCppNativeLanguageModel.doGenerate', () => {
  it('posts the rendered prompt to /completion and maps the response', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = makeFetch((body) => {
      capturedBody = body;
      return new Response(
        JSON.stringify({
          content: 'Bonjour !',
          stop: true,
          stopped_eos: true,
          tokens_predicted: 3,
          tokens_evaluated: 7,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const model = new LlamaCppNativeLanguageModel('qwen3', {
      providerId: 'llama',
      rootURL: 'http://llama-generate.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await model.doGenerate(callOptions());

    expect(result.content).toEqual([{ type: 'text', text: 'Bonjour !' }]);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stopped_eos' });
    expect(result.usage.inputTokens.total).toBe(7);
    expect(result.usage.outputTokens.total).toBe(3);

    expect(capturedBody?.prompt).toBe('<|im_start|>user\nSay hi<|im_end|>\n<|im_start|>assistant\n');
    expect(capturedBody?.cache_prompt).toBe(true);
    expect(capturedBody?.stop).toEqual(['<|im_end|>']);
  });

  it('merges providerOptions[providerId] into the request body (grammar, mirostat...)', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = makeFetch((body) => {
      capturedBody = body;
      return new Response(JSON.stringify({ content: 'ok', stop: true }), { status: 200 });
    });

    const model = new LlamaCppNativeLanguageModel('qwen3', {
      providerId: 'llama',
      rootURL: 'http://llama-native-params.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await model.doGenerate(
      callOptions({
        providerOptions: { llama: { grammar: 'root ::= "yes" | "no"', mirostat: 2 } },
      }),
    );

    expect(capturedBody?.grammar).toBe('root ::= "yes" | "no"');
    expect(capturedBody?.mirostat).toBe(2);
  });

  it('throws UnsupportedFunctionalityError when tools are present, without calling fetch', async () => {
    const fetchMock = makeFetch(() => new Response('{}', { status: 200 }));
    const model = new LlamaCppNativeLanguageModel('qwen3', {
      providerId: 'llama',
      rootURL: 'http://llama-tools.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      model.doGenerate(
        callOptions({
          tools: [{ type: 'function', name: 'web_search', inputSchema: { type: 'object' } }],
        }),
      ),
    ).rejects.toSatisfy((error: unknown) => UnsupportedFunctionalityError.isInstance(error));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces llama.cpp error responses as a rejected promise with the server message', async () => {
    const fetchMock = makeFetch(
      () =>
        new Response(JSON.stringify({ error: { message: 'model not loaded', type: 'server_error' } }), {
          status: 500,
        }),
    );
    const model = new LlamaCppNativeLanguageModel('qwen3', {
      providerId: 'llama',
      rootURL: 'http://llama-error.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(model.doGenerate(callOptions())).rejects.toThrow('model not loaded');
  });
});

describe('LlamaCppNativeLanguageModel.doStream', () => {
  it('streams text deltas and a finish part derived from the final SSE chunk', async () => {
    const fetchMock = makeFetch(() =>
      new Response(sseStream([
        { content: 'Bon', stop: false },
        { content: 'jour', stop: false },
        { content: '', stop: true, stopped_limit: true, tokens_predicted: 2, tokens_evaluated: 5 },
      ]), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const model = new LlamaCppNativeLanguageModel('qwen3', {
      providerId: 'llama',
      rootURL: 'http://llama-stream.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { stream } = await model.doStream(callOptions());
    const parts = await collect(stream);

    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'Bon' },
      { type: 'text-delta', id: 'txt-0', delta: 'jour' },
      { type: 'text-end', id: 'txt-0' },
      {
        type: 'finish',
        finishReason: { unified: 'length', raw: 'stopped_limit' },
        usage: {
          inputTokens: { total: 5, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 2, text: 2, reasoning: undefined },
        },
      },
    ]);
  });

  it('surfaces an inline error chunk without throwing out of the stream', async () => {
    const fetchMock = makeFetch(() =>
      new Response(sseStream([{ error: { message: 'context overflow', type: 'server_error' } }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    const model = new LlamaCppNativeLanguageModel('qwen3', {
      providerId: 'llama',
      rootURL: 'http://llama-stream-error.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { stream } = await model.doStream(callOptions());
    const parts = await collect(stream);

    const errorPart = parts.find((p) => p.type === 'error');
    expect(errorPart).toBeDefined();
    const finishPart = parts.find((p) => p.type === 'finish');
    expect(finishPart).toMatchObject({ finishReason: { unified: 'error' } });
  });
});
