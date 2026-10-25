import { describe, it, expect } from 'vitest';
import { Chat } from '@ai-sdk/react';
import {
  hasUnfinishedReply,
  isConnectionLoss,
  ResumableChatTransport,
  withoutUnfinishedReply,
} from '@/lib/chat-resume';
import type { ChatMessage } from '@/lib/types';

const user: ChatMessage = { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Question' }] };
const partialReply: ChatMessage = { id: 'reply-1', role: 'assistant', parts: [{ type: 'text', text: 'The ans' }] };

// What the resume route replays: the turn from its first chunk.
const replayedTurn = [
  { type: 'start', messageId: 'reply-1' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'The answer.' },
  { type: 'text-end', id: 't1' },
  { type: 'finish' },
];

function sseResponse(chunks: object[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function replyText(message: ChatMessage | undefined): string {
  return (message?.parts ?? []).flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
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

describe('hasUnfinishedReply / withoutUnfinishedReply', () => {
  it('drops the partial reply of the current turn', () => {
    expect(hasUnfinishedReply([user, partialReply])).toBe(true);
    expect(withoutUnfinishedReply([user, partialReply])).toEqual([user]);
  });

  it('keeps a turn that never got a reply as it is', () => {
    expect(hasUnfinishedReply([user])).toBe(false);
    expect(withoutUnfinishedReply([user])).toEqual([user]);
  });
});

describe('ResumableChatTransport', () => {
  function chatWith(response: () => Response) {
    let reconnections = 0;
    const transport: ResumableChatTransport = new ResumableChatTransport({
      api: '/api/search',
      fetch: async () => response(),
      onReconnected: () => {
        reconnections += 1;
        chat.messages = withoutUnfinishedReply(chat.messages);
      },
    });
    const chat = new Chat<ChatMessage>({ id: 'chat-1', transport, messages: [user, partialReply] });
    return { chat, reconnections: () => reconnections };
  }

  it('replays the turn once, in place of the partial reply', async () => {
    const { chat, reconnections } = chatWith(() => sseResponse(replayedTurn));

    await chat.resumeStream();

    expect(reconnections()).toBe(1);
    expect(chat.messages.map((message) => message.id)).toEqual(['user-1', 'reply-1']);
    expect(replyText(chat.messages.at(-1))).toBe('The answer.');
    expect(chat.status).toBe('ready');
  });

  it('keeps the partial reply when there is no stream to resume', async () => {
    const { chat, reconnections } = chatWith(() => new Response(null, { status: 204 }));

    await chat.resumeStream();

    expect(reconnections()).toBe(0);
    expect(chat.messages).toEqual([user, partialReply]);
  });

  it('keeps the partial reply when the resume request fails', async () => {
    const { chat, reconnections } = chatWith(() => new Response('{"code":"not_found:stream"}', { status: 404 }));

    await chat.resumeStream();

    expect(reconnections()).toBe(0);
    expect(chat.messages).toEqual([user, partialReply]);
    expect(chat.status).toBe('error');
  });
});
