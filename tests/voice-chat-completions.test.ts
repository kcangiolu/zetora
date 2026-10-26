import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SYNTHESIS_NUDGE } from '@/lib/search/prepare-step';

// Wiring test for the local-voice LLM stage (/api/v1/chat/completions). It runs
// the tool loop server-side and must forward ONLY the final spoken text — never
// tool-call XML/JSON — through the OpenAI-compatible SSE stream, with tool steps as
// separate `tool` chunks. We mock the
// `ai` module (repo convention, see auto-router.test.ts) and the collaborators,
// then assert how streamText is configured and what the stream emits. The real
// resolvePrepareStepOverride is exercised through the captured prepareStep.

const streamText = vi.hoisted(() => vi.fn());
const resolveVoiceRequestUserId = vi.hoisted(() => vi.fn());
const getCachedUserPreferencesByUserId = vi.hoisted(() => vi.fn());
const resolveTertiaryModel = vi.hoisted(() => vi.fn());
const getTaskModel = vi.hoisted(() => vi.fn());
const getAnonymizeContext = vi.hoisted(() => vi.fn());
const loadConfiguredTools = vi.hoisted(() => vi.fn());
const getPiiAliasesByTokens = vi.hoisted(() => vi.fn());
const upsertPiiAliases = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText };
});
vi.mock('@/lib/voice-session-token', () => ({ resolveVoiceRequestUserId }));
vi.mock('@/lib/user-data-server', () => ({ getCachedUserPreferencesByUserId }));
vi.mock('@/ai/tertiary', () => ({ resolveTertiaryModel }));
vi.mock('@/ai/catalog/task-models', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ai/catalog/task-models')>()),
  getTaskModel,
}));
vi.mock('@/ai/providers', () => ({ getAnonymizeContext }));
vi.mock('@/lib/search/tool-loader', () => ({ loadConfiguredTools }));
// StreamTokenBuffer -> deanonymizeText -> lib/db/queries; no real DB in unit tests.
// With an empty vault, deanonymizeText leaves any token it can't resolve as-is,
// which is exactly the "invented/orphan token" case the route's scrub must catch.
vi.mock('@/lib/db/queries', () => ({ getPiiAliasesByTokens, upsertPiiAliases }));

import { POST } from '@/app/api/v1/chat/completions/route';

const VOICE_TOOLS = ['web_search', 'retrieve', 'get_weather_data', 'datetime'];

async function* textDeltas(...parts: string[]) {
  for (const text of parts) yield { type: 'text-delta', text };
}

async function* streamParts(...parts: unknown[]) {
  for (const part of parts) yield part;
}

// The data chunks of an SSE body, without [DONE] and keepalive comments.
function dataChunks(body: string): Record<string, unknown>[] {
  return body
    .split('\n\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as never,
  );

// Capture the single options object streamText was called with.
const lastStreamTextOptions = () => streamText.mock.calls[streamText.mock.calls.length - 1][0];

beforeEach(() => {
  vi.clearAllMocks();
  resolveVoiceRequestUserId.mockResolvedValue('u1');
  getCachedUserPreferencesByUserId.mockResolvedValue({ preferences: {} });
  resolveTertiaryModel.mockResolvedValue('mock-model');
  getTaskModel.mockReturnValue('xai:grok-4.5');
  getAnonymizeContext.mockResolvedValue(null);
  getPiiAliasesByTokens.mockResolvedValue([]);
  loadConfiguredTools.mockResolvedValue({
    web_search: { execute: vi.fn() },
    retrieve: { execute: vi.fn() },
    get_weather_data: { execute: vi.fn() },
    datetime: { execute: vi.fn() },
  });
  streamText.mockReturnValue({ fullStream: textDeltas('Here is ', 'the answer.') });
});

describe('POST /api/v1/chat/completions (local voice LLM stage)', () => {
  it('401s when the voice session token is missing/invalid', async () => {
    resolveVoiceRequestUserId.mockResolvedValueOnce(null);
    const res = await post({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
    expect(streamText).not.toHaveBeenCalled();
  });

  it('answers 400 with the setting to change when no voice model is configured', async () => {
    const { ModelUnavailableError } = await import('@/ai/catalog/task-models');
    resolveTertiaryModel.mockRejectedValueOnce(
      new ModelUnavailableError('Voice (Local Backend): no model is configured. Pick one in Settings → AI Models.'),
    );

    const res = await post({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Settings → AI Models');
    expect(streamText).not.toHaveBeenCalled();
  });

  it('rejects a body without a messages array', async () => {
    const res = await post({ nope: true });
    expect(res.status).toBe(400);
  });

  it('attaches the curated voice toolset with tools armed', async () => {
    await post({ messages: [{ role: 'user', content: "what's the news?" }] });

    expect(loadConfiguredTools).toHaveBeenCalledWith(
      expect.objectContaining({ activeToolNames: VOICE_TOOLS, dataStream: undefined }),
    );
    const opts = lastStreamTextOptions();
    expect(Object.keys(opts.tools)).toEqual(expect.arrayContaining(VOICE_TOOLS));
    expect(opts.activeTools).toEqual(VOICE_TOOLS);
    expect(opts.toolChoice).toBe('auto');
    expect(opts.stopWhen).toBeDefined();
  });

  it('extracts the persona system message and appends spoken tool guidance', async () => {
    await post({
      messages: [
        { role: 'system', content: 'You are Zetora.' },
        { role: 'user', content: 'hello' },
      ],
    });
    const opts = lastStreamTextOptions();
    expect(opts.system.startsWith('You are Zetora.')).toBe(true);
    expect(opts.system).toContain('web_search');
    // The system message must be stripped from the forwarded conversation.
    expect(opts.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('streams only the final text as OpenAI chunks and never leaks tool markup', async () => {
    streamText.mockReturnValueOnce({ fullStream: textDeltas('Paris ', 'is sunny.') });
    const res = await post({ messages: [{ role: 'user', content: 'weather in paris?' }] });
    const body = await res.text();

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(body).toContain('"content":"Paris "');
    expect(body).toContain('"content":"is sunny."');
    expect(body).toContain('data: [DONE]');
    expect(body).toContain('"finish_reason":"stop"');
    expect(body).not.toContain('<web_search');
    expect(body).not.toContain('tool_call');
  });

  it('sends each tool step, its part to save and its compact trace for the history', async () => {
    const call = { toolCallId: 'call-1', toolName: 'web_search', input: { queries: ['DanMachi volume 22'] } };
    const output = {
      searches: [
        {
          query: 'DanMachi volume 22',
          results: [{ title: 'T', url: 'https://example.com', content: 'long page' }],
          images: [],
        },
      ],
    };
    streamText.mockReturnValueOnce({
      fullStream: streamParts(
        { type: 'start-step' },
        { type: 'text-delta', text: 'Let me check.' },
        { type: 'tool-call', ...call },
        { type: 'tool-result', ...call, output },
        { type: 'start-step' },
        { type: 'text-delta', text: 'Volume 22 is out.' },
      ),
    });

    const chunks = dataChunks(await (await post({ messages: [{ role: 'user', content: 'DanMachi?' }] })).text());

    expect(chunks.filter((chunk) => 'tool' in chunk).map((chunk) => chunk.tool)).toEqual([
      { callId: 'call-1', name: 'web_search', preview: 'DanMachi volume 22', status: 'running' },
      { callId: 'call-1', name: 'web_search', preview: null, status: 'ok' },
    ]);
    const text = chunks
      .flatMap((chunk) => (Array.isArray(chunk.choices) ? chunk.choices : []))
      .map((choice) => choice.delta?.content ?? '')
      .join('');
    expect(text).toBe('Let me check. Volume 22 is out.');
    const step = chunks.find((chunk) => 'step' in chunk)?.step;
    expect(step).toEqual({
      part: { type: 'tool-web_search', toolCallId: 'call-1', state: 'output-available', input: call.input, output },
      history: [
        { role: 'assistant', content: [{ type: 'tool-call', ...call }] },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'web_search',
              output: {
                type: 'text',
                value: JSON.stringify({
                  searches: [{ query: 'DanMachi volume 22', results: [{ title: 'T', url: 'https://example.com' }] }],
                }),
              },
            },
          ],
        },
      ],
    });
  });

  it('shows why a tool failed, whether it threw or its searches failed', async () => {
    const search = { toolCallId: 'call-1', toolName: 'web_search', input: { queries: ['q'] } };
    const weather = { toolCallId: 'call-2', toolName: 'get_weather_data', input: { location: 'Paris' } };
    streamText.mockReturnValueOnce({
      fullStream: streamParts(
        { type: 'tool-call', ...search },
        { type: 'tool-call', ...weather },
        {
          type: 'tool-result',
          ...search,
          output: { searches: [{ query: 'q', results: [], images: [], error: 'SearXNG failed: no engine answered' }] },
        },
        { type: 'tool-error', ...weather, error: new Error('Weather API returned 503') },
        { type: 'text-delta', text: 'The search did not work.' },
      ),
    });

    const chunks = dataChunks(await (await post({ messages: [{ role: 'user', content: 'hi' }] })).text());

    expect(chunks.filter((chunk) => 'tool' in chunk).map((chunk) => chunk.tool)).toEqual([
      { callId: 'call-1', name: 'web_search', preview: 'q', status: 'running' },
      { callId: 'call-2', name: 'get_weather_data', preview: 'Paris', status: 'running' },
      {
        callId: 'call-1',
        name: 'web_search',
        preview: null,
        status: 'Search failed. The reply could not use any web results.',
      },
      { callId: 'call-2', name: 'get_weather_data', preview: null, status: 'Weather API returned 503' },
    ]);
    const weatherStep = chunks.filter((chunk) => 'step' in chunk)[1].step;
    expect(weatherStep).toMatchObject({
      part: { type: 'tool-get_weather_data', state: 'output-error', errorText: 'Weather API returned 503' },
    });
    expect(JSON.stringify(weatherStep)).toContain('{"type":"error-text","value":"Weather API returned 503"}');
  });

  it('scrubs orphan anonymization tokens the model invented instead of speaking them raw', async () => {
    streamText.mockReturnValueOnce({
      fullStream: textDeltas('Elon works at ', '⟦ORGANIZATION_32e8be4b88⟧', ', I think.'),
    });
    const res = await post({ messages: [{ role: 'user', content: 'who does Elon work for?' }] });
    const body = await res.text();

    expect(body).not.toContain('⟦');
    expect(body).not.toContain('ORGANIZATION_32e8be4b88');
    expect(body).toContain('Elon works at ');
    expect(body).toContain(', I think.');
  });

  it('scrubs an orphan token even when its delimiters are split across deltas', async () => {
    streamText.mockReturnValueOnce({
      // "⟦PERSON_c1a7ff3914⟧" split mid-token across three deltas.
      fullStream: textDeltas('Hello ', '⟦PERSON_c1a7f', 'f3914⟧', ', nice to meet you.'),
    });
    const res = await post({ messages: [{ role: 'user', content: 'hi' }] });
    const body = await res.text();

    expect(body).not.toContain('⟦');
    expect(body).not.toContain('PERSON_c1a7ff3914');
    expect(body).toContain('Hello ');
    expect(body).toContain(', nice to meet you.');
  });

  it('native model: empties tools after a tool round-trip to force synthesis', async () => {
    await post({ messages: [{ role: 'user', content: 'hi' }] });
    const { prepareStep } = lastStreamTextOptions();

    const armed = await prepareStep({ steps: [] });
    expect(armed.activeTools).toEqual(VOICE_TOOLS);

    const afterTool = await prepareStep({ steps: [{ toolCalls: [{}], toolResults: [{}] }] });
    expect(afterTool.activeTools).toEqual([]);
  });

  it('XML-parsed custom voice model: keeps schemas armed and nudges toward synthesis', async () => {
    getTaskModel.mockReturnValue('custom-ollama-qwen3');
    getCachedUserPreferencesByUserId.mockResolvedValue({
      preferences: { 'zetora-xml-tool-parsing-enabled': true },
    });

    await post({ messages: [{ role: 'user', content: 'hi' }] });
    const { prepareStep } = lastStreamTextOptions();

    const afterTool = await prepareStep({ steps: [{ toolCalls: [{}], toolResults: [{}] }] });
    expect(afterTool.activeTools).toEqual(VOICE_TOOLS);
    expect(afterTool.system).toContain(SYNTHESIS_NUDGE.trim());
  });

  it('reports a model error in the stream instead of ending with an empty reply', async () => {
    streamText.mockImplementationOnce((options: { onError: (event: { error: unknown }) => void }) => ({
      fullStream: (async function* () {
        options.onError({ error: new Error('Authentication Fails, Your api key: ****b431 is invalid') });
      })(),
    }));

    const res = await post({ messages: [{ role: 'user', content: 'hi' }] });
    const body = await res.text();

    expect(body).toContain('"error":{"message":"The voice model xai:grok-4.5 failed.');
    expect(body).not.toContain('b431');
    expect(body).not.toContain('[DONE]');
  });

  it('passes the request signal so an interrupted reply stops generating', async () => {
    const controller = new AbortController();
    await POST(
      new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
        signal: controller.signal,
      }) as never,
    );

    const { abortSignal } = lastStreamTextOptions();
    expect(abortSignal.aborted).toBe(false);
    controller.abort();
    expect(abortSignal.aborted).toBe(true);
  });

  describe('while a tool call keeps the model quiet', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends SSE keepalive comments, then the answer', async () => {
      let releaseAnswer = () => {};
      const answerReady = new Promise<void>((resolve) => {
        releaseAnswer = resolve;
      });
      streamText.mockReturnValueOnce({
        fullStream: (async function* () {
          await answerReady;
          yield { type: 'text-delta', text: 'Found it.' };
        })(),
      });

      const res = await post({ messages: [{ role: 'user', content: 'search something slow' }] });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      await vi.advanceTimersByTimeAsync(25_000);
      releaseAnswer();
      let body = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value);
      }

      expect(body.match(/^: keepalive$/gm)).toHaveLength(2);
      expect(body.indexOf(': keepalive')).toBeLessThan(body.indexOf('Found it.'));
      expect(body).toContain('data: [DONE]');
    });
  });
});
