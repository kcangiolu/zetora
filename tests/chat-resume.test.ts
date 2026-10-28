import { describe, it, expect } from 'vitest';
import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { hasUnfinishedReply, isConnectionLoss } from '@/lib/chat-resume';
import type { ChatMessage } from '@/lib/types';

const user: ChatMessage = { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Question' }] };
const partialReply: ChatMessage = { id: 'reply-1', role: 'assistant', parts: [{ type: 'text', text: 'The ans' }] };

// A whole turn as the resume route replays it, from its first chunk.
const turn = [
  { type: 'start', messageId: 'reply-1' },
  { type: 'start-step' },
  { type: 'reasoning-start', id: 'r1' },
  { type: 'reasoning-delta', id: 'r1', delta: 'Thinking' },
  { type: 'reasoning-end', id: 'r1' },
  { type: 'tool-input-start', toolCallId: 'call-1', toolName: 'web_search' },
  { type: 'tool-input-delta', toolCallId: 'call-1', inputTextDelta: '{"query":"x"}' },
  { type: 'tool-input-available', toolCallId: 'call-1', toolName: 'web_search', input: { query: 'x' } },
  { type: 'tool-output-available', toolCallId: 'call-1', output: { results: [] } },
  { type: 'finish-step' },
  { type: 'start-step' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'The ' },
  { type: 'text-delta', id: 't1', delta: 'answer.' },
  { type: 'text-end', id: 't1' },
  { type: 'finish-step' },
  { type: 'finish' },
];
const wholeReplyParts = ['step-start', 'reasoning', 'tool-web_search', 'step-start', 'text'];

function sse(chunks: object[]): string {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('');
}

function sseResponse(chunks: object[]): Response {
  return new Response(sse(chunks) + 'data: [DONE]\n\n', { status: 200 });
}

// The first chunks of the turn, then the connection either drops with `loss`
// or stays open without sending anything more.
function cutResponse(chunks: object[], loss?: Error): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse(chunks)));
      if (loss) setTimeout(() => controller.error(loss), 0);
    },
  });
  return new Response(body, { status: 200 });
}

function replyText(message: ChatMessage | undefined): string {
  return (message?.parts ?? []).flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

// The transport goes to the Chat as it is, as components/chat-interface.tsx
// does: useChat would hide its resumeStreamIsReplay flag.
function chatAnswering(firstResponse: () => Response, messages: ChatMessage[] = []) {
  let requests = 0;
  const transport = new DefaultChatTransport<ChatMessage>({
    api: '/api/search',
    fetch: async () => {
      requests += 1;
      return requests === 1 ? firstResponse() : sseResponse(turn);
    },
  });
  return new Chat<ChatMessage>({ id: 'chat-1', transport, messages });
}

describe('isConnectionLoss', () => {
  it('treats a TypeError from fetch or a body read as a dropped connection', () => {
    expect(isConnectionLoss(new TypeError('Load failed'))).toBe(true);
  });

  it('leaves an error the server reported on screen', () => {
    expect(isConnectionLoss(new Error('{"code":"not_found:stream"}'))).toBe(false);
    expect(isConnectionLoss(undefined)).toBe(false);
  });
});

describe('hasUnfinishedReply', () => {
  it('is true once the reply of the current turn started', () => {
    expect(hasUnfinishedReply([user, partialReply])).toBe(true);
  });

  it('is false for a turn that never got a reply', () => {
    expect(hasUnfinishedReply([user])).toBe(false);
  });
});

describe('resuming a reply', () => {
  // WebKit words a dropped connection either way; the SDK keeps the partial
  // reply's state for the second one only, as its message mentions the network.
  const losses = [new TypeError('Load failed'), new TypeError('The network connection was lost.')];

  for (const loss of losses) {
    it(`replaces the partial reply after "${loss.message}", wherever the stream was cut`, async () => {
      for (let cut = 1; cut < turn.length; cut++) {
        const chat = chatAnswering(() => cutResponse(turn.slice(0, cut), loss));
        await chat.sendMessage({ text: 'Question' });
        expect(chat.status).toBe('error');

        chat.clearError();
        await chat.resumeStream();

        expect(chat.status).toBe('ready');
        expect(chat.messages).toHaveLength(2);
        expect(chat.messages[1].id).toBe('reply-1');
        expect(chat.messages[1].parts.map((part) => part.type)).toEqual(wholeReplyParts);
        expect(replyText(chat.messages[1])).toBe('The answer.');
      }
    });
  }

  it('replaces the partial reply of a stream that stopped sending, once reading it is stopped', async () => {
    const chat = chatAnswering(() => cutResponse(turn.slice(0, 13)));
    const sending = chat.sendMessage({ text: 'Question' });
    await expect.poll(() => replyText(chat.messages[1])).toBe('The ');

    await chat.stop();
    await sending;
    await chat.resumeStream();

    expect(chat.status).toBe('ready');
    expect(chat.messages.map((message) => message.id).slice(1)).toEqual(['reply-1']);
    expect(chat.messages[1].parts.map((part) => part.type)).toEqual(wholeReplyParts);
    expect(replyText(chat.messages[1])).toBe('The answer.');
  });

  it('keeps the partial reply when there is no stream to resume', async () => {
    const chat = chatAnswering(() => new Response(null, { status: 204 }), [user, partialReply]);

    await chat.resumeStream();

    expect(chat.messages).toEqual([user, partialReply]);
    expect(chat.status).toBe('ready');
  });

  it('keeps the partial reply when the resume request fails', async () => {
    const chat = chatAnswering(
      () => new Response('{"code":"not_found:stream"}', { status: 404 }),
      [user, partialReply],
    );

    await chat.resumeStream();

    expect(chat.messages).toEqual([user, partialReply]);
    expect(chat.status).toBe('error');
  });
});
