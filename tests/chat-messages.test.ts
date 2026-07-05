import { describe, it, expect } from 'vitest';
import { formatISO } from 'date-fns';
import { convertToUIMessages } from '@/lib/chat-messages';
import type { Message } from '@/lib/db/schema';

const createdAt = new Date('2026-07-05T10:00:00Z');

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    chatId: 'chat-1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'hello' }],
    attachments: [],
    createdAt,
    updatedAt: createdAt,
    model: 'zetora-default',
    completionTime: 1200,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    ...overrides,
  } as Message;
}

describe('convertToUIMessages', () => {
  it('maps id, role, parts and metadata', () => {
    const [ui] = convertToUIMessages([makeMessage()]);
    expect(ui.id).toBe('msg-1');
    expect(ui.role).toBe('assistant');
    expect(ui.parts).toEqual([{ type: 'text', text: 'hello' }]);
    expect(ui.metadata).toEqual({
      createdAt: formatISO(createdAt),
      model: 'zetora-default',
      completionTime: 1200,
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    });
  });

  it('defaults a null model to an empty string and tolerates non-array parts', () => {
    const [ui] = convertToUIMessages([makeMessage({ model: null, parts: null as never })]);
    expect(ui.metadata?.model).toBe('');
    expect(ui.parts).toEqual([]);
  });

  it('converts legacy tool-invocation parts to the AI SDK v6 shape', () => {
    const legacy = {
      type: 'tool-invocation',
      toolInvocation: {
        toolName: 'web_search',
        toolCallId: 'call-1',
        state: 'result',
        args: { query: 'foo' },
        result: { hits: 3 },
      },
    };
    const [ui] = convertToUIMessages([makeMessage({ parts: [legacy] as never })]);
    expect(ui.parts[0]).toEqual({
      type: 'tool-web_search',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: 'foo' },
      output: { hits: 3 },
    });
  });

  it.each([
    ['result', 'output-available'],
    ['partial-result', 'input-available'],
    ['call', 'input-streaming'],
    ['already-new-state', 'already-new-state'],
  ])('maps legacy tool state %s to %s', (oldState, newState) => {
    const legacy = {
      type: 'tool-invocation',
      toolInvocation: { toolName: 't', toolCallId: 'c', state: oldState, args: {}, result: null },
    };
    const [ui] = convertToUIMessages([makeMessage({ parts: [legacy] as never })]);
    expect((ui.parts[0] as { state: string }).state).toBe(newState);
  });

  it('keeps modern reasoning parts with text untouched', () => {
    const part = { type: 'reasoning', text: 'because' };
    const [ui] = convertToUIMessages([makeMessage({ parts: [part] as never })]);
    expect(ui.parts[0]).toBe(part);
  });

  it('rebuilds reasoning text from legacy reasoning + details fields', () => {
    const legacy = {
      type: 'reasoning',
      text: '',
      reasoning: 'main thought',
      details: [{ type: 'text', text: 'detail one' }, { type: 'redacted' }, { type: 'text', text: 'detail two' }],
    };
    const [ui] = convertToUIMessages([makeMessage({ parts: [legacy] as never })]);
    expect(ui.parts[0]).toEqual({
      type: 'reasoning',
      text: 'main thought\n\ndetail one\n\ndetail two',
    });
  });

  it('passes unrelated parts through untouched', () => {
    const part = { type: 'source-url', url: 'https://example.com' };
    const [ui] = convertToUIMessages([makeMessage({ parts: [part] as never })]);
    expect(ui.parts[0]).toBe(part);
  });
});
