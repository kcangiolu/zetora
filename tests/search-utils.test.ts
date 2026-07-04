import { describe, it, expect } from 'vitest';
import { extractChatSearchableText, extractChatPreview } from '@/lib/search-utils';
import type { Chat, Message } from '@/lib/db/schema';

function chat(title: string | null): Chat {
  return { title } as Chat;
}

function userMessage(parts: unknown): Message {
  return { role: 'user', parts } as unknown as Message;
}

describe('extractChatSearchableText', () => {
  it('combines the title with the first user message text', () => {
    const messages = [userMessage([{ type: 'text', text: 'How does X work?' }])];
    expect(extractChatSearchableText(chat('My chat'), messages)).toBe('My chat How does X work?');
  });

  it('joins multiple text parts of the first user message', () => {
    const messages = [
      userMessage([
        { type: 'text', text: 'part one' },
        { type: 'file', url: 'x' },
        { type: 'text', text: 'part two' },
      ]),
    ];
    expect(extractChatSearchableText(chat(null), messages)).toBe('part one part two');
  });

  it('ignores assistant messages', () => {
    const messages = [
      { role: 'assistant', parts: [{ type: 'text', text: 'answer' }] } as unknown as Message,
      userMessage([{ type: 'text', text: 'question' }]),
    ];
    expect(extractChatSearchableText(chat('T'), messages)).toBe('T question');
  });

  it('returns the title alone when there is no user text', () => {
    expect(extractChatSearchableText(chat('Only title'), [])).toBe('Only title');
  });
});

describe('extractChatPreview', () => {
  it('returns the first user message text', () => {
    const messages = [userMessage([{ type: 'text', text: 'hello there' }])];
    expect(extractChatPreview(messages)).toBe('hello there');
  });

  it('truncates text longer than maxLength', () => {
    const long = 'a'.repeat(200);
    const out = extractChatPreview([userMessage([{ type: 'text', text: long }])], 150);
    expect(out).toHaveLength(153); // 150 chars + '...'
    expect(out.endsWith('...')).toBe(true);
  });

  it('returns a placeholder when there are no messages', () => {
    expect(extractChatPreview([])).toBe('No messages');
  });
});
