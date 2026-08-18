import { describe, it, expect, vi } from 'vitest';
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { OllamaNativeLanguageModel } from '@/ai/native-models/ollama-model';

function ndjsonStreamFromChunks(rawChunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of rawChunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function makeFetch(chat: (body: Record<string, unknown>) => Response) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = url.toString();
    if (href.endsWith('/api/chat')) {
      const body = JSON.parse(init!.body as string) as Record<string, unknown>;
      return chat(body);
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

describe('OllamaNativeLanguageModel.doGenerate', () => {
  it('posts messages/tools/think to /api/chat and maps the response', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = makeFetch((body) => {
      capturedBody = body;
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: 'Bonjour !' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 7,
          eval_count: 3,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const model = new OllamaNativeLanguageModel('qwen3', {
      providerId: 'olla',
      rootURL: 'http://ollama-generate.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await model.doGenerate(
      callOptions({ providerOptions: { olla: { think: true, num_ctx: 8192 } } }),
    );

    expect(result.content).toEqual([{ type: 'text', text: 'Bonjour !' }]);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
    expect(result.usage.inputTokens.total).toBe(7);
    expect(result.usage.outputTokens.total).toBe(3);

    expect(capturedBody?.think).toBe(true);
    expect(capturedBody?.stream).toBe(false);
    expect((capturedBody?.options as Record<string, unknown>).num_ctx).toBe(8192);
    expect(capturedBody?.messages).toEqual([{ role: 'user', content: 'Say hi' }]);
  });

  it('converts function tools to Ollama tool defs and rejects provider-executed tools', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = makeFetch((body) => {
      capturedBody = body;
      return new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true }), {
        status: 200,
      });
    });
    const model = new OllamaNativeLanguageModel('qwen3', {
      providerId: 'olla',
      rootURL: 'http://ollama-tools.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await model.doGenerate(
      callOptions({
        tools: [{ type: 'function', name: 'web_search', description: 'search', inputSchema: { type: 'object' } }],
      }),
    );

    expect(capturedBody?.tools).toEqual([
      { type: 'function', function: { name: 'web_search', description: 'search', parameters: { type: 'object' } } },
    ]);

    await expect(
      model.doGenerate(callOptions({ tools: [{ type: 'provider', id: 'anthropic.web_search', name: 'web_search', args: {} }] })),
    ).rejects.toThrow(/provider-executed/);
  });
});

describe('OllamaNativeLanguageModel.doStream', () => {
  it('parses NDJSON split across chunk boundaries into text/reasoning deltas and a finish part', async () => {
    const line1 = `${JSON.stringify({ message: { role: 'assistant', thinking: 'hmm' }, done: false })}\n`;
    const line3 = `${JSON.stringify({
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 5,
      eval_count: 2,
    })}\n`;

    // Split the second JSON line itself across two stream chunks to exercise
    // the buffering path, then send the rest of that line plus the third
    // line together in one chunk.
    const fullLine2 = `${JSON.stringify({ message: { role: 'assistant', content: 'Bonjour' }, done: false })}\n`;
    const splitPoint = Math.floor(fullLine2.length / 2);

    const fetchMock = makeFetch(() =>
      new Response(
        ndjsonStreamFromChunks([line1, fullLine2.slice(0, splitPoint), fullLine2.slice(splitPoint), line3]),
        { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
      ),
    );

    const model = new OllamaNativeLanguageModel('qwen3', {
      providerId: 'olla',
      rootURL: 'http://ollama-stream.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { stream } = await model.doStream(callOptions());
    const parts = await collect(stream);

    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      { type: 'reasoning-start', id: 'reasoning-0' },
      { type: 'reasoning-delta', id: 'reasoning-0', delta: 'hmm' },
      { type: 'reasoning-end', id: 'reasoning-0' },
      { type: 'text-start', id: 'txt-0' },
      { type: 'text-delta', id: 'txt-0', delta: 'Bonjour' },
      { type: 'text-end', id: 'txt-0' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 5, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 2, text: 2, reasoning: undefined },
        },
      },
    ]);
  });

  it('emits a full tool-input/tool-call sequence for a whole tool_calls chunk', async () => {
    const chunk = `${JSON.stringify({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'Paris' } } }],
      },
      done: true,
      done_reason: 'stop',
    })}\n`;

    const fetchMock = makeFetch(
      () => new Response(ndjsonStreamFromChunks([chunk]), { status: 200 }),
    );
    const model = new OllamaNativeLanguageModel('qwen3', {
      providerId: 'olla',
      rootURL: 'http://ollama-stream-tools.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { stream } = await model.doStream(callOptions());
    const parts = await collect(stream);

    const types = parts.map((p) => p.type);
    expect(types).toEqual(['stream-start', 'tool-input-start', 'tool-input-delta', 'tool-input-end', 'tool-call', 'finish']);

    const toolCall = parts.find((p) => p.type === 'tool-call');
    expect(toolCall).toMatchObject({ toolName: 'get_weather', input: JSON.stringify({ city: 'Paris' }) });

    const finish = parts.find((p) => p.type === 'finish');
    expect(finish).toMatchObject({ finishReason: { unified: 'tool-calls' } });
  });
});
