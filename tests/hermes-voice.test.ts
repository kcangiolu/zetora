import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { subscribeToHermesChat, sendToHermes, getUserById, resolveVoiceRequestUserId } = vi.hoisted(() => ({
  subscribeToHermesChat: vi.fn(),
  sendToHermes: vi.fn(),
  getUserById: vi.fn(),
  resolveVoiceRequestUserId: vi.fn(),
}));

vi.mock('@/lib/hermes/feature-flag', () => ({ assertHermesEnabled: () => null }));
vi.mock('@/lib/hermes/realtime', () => ({ subscribeToHermesChat }));
vi.mock('@/lib/hermes/send', () => ({ sendToHermes }));
vi.mock('@/lib/db/queries', () => ({ getUserById }));
vi.mock('@/lib/voice-session-token', () => ({ resolveVoiceRequestUserId }));

import { POST } from '@/app/api/voice/hermes/route';
import { HermesSpeechTracker, hermesMessageText } from '@/lib/hermes/voice-reply';

const CHAT_ID = '6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';

describe('HermesSpeechTracker', () => {
  it('speaks each draft once, then only what the final message adds', () => {
    const tracker = new HermesSpeechTracker();
    expect(tracker.draft(1, 'Hello')).toBe('Hello');
    expect(tracker.draft(1, 'Hello there.')).toBe(' there.');
    expect(tracker.message('Hello there. Bye.')).toBe(' Bye.');
  });

  it('speaks a message that had no draft whole, and starts over on a new segment', () => {
    const tracker = new HermesSpeechTracker();
    expect(tracker.message('First.')).toBe('First.');
    expect(tracker.draft(2, 'Second')).toBe('Second');
    expect(tracker.message('Second.')).toBe('.');
    expect(tracker.draft(3, 'Third')).toBe('Third');
  });

  it('adds nothing for a text that rewrites what was already spoken', () => {
    const tracker = new HermesSpeechTracker();
    expect(tracker.draft(1, 'The answer is 4')).toBe('The answer is 4');
    expect(tracker.message('**The answer** is 4')).toBe('');
  });

  it('reads the text parts of a message', () => {
    expect(
      hermesMessageText([
        { type: 'text', text: 'a' },
        { type: 'file', url: 'x' },
        { type: 'text', text: 'b' },
      ]),
    ).toBe('a\nb');
  });
});

describe('POST /api/voice/hermes', () => {
  let emit: (frame: unknown) => void;
  const unsubscribe = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resolveVoiceRequestUserId.mockResolvedValue('user-1');
    getUserById.mockResolvedValue({ id: 'user-1', name: 'Ada' });
    sendToHermes.mockResolvedValue({ ok: true, messageId: 'm-1' });
    subscribeToHermesChat.mockImplementation(async (_chatId: string, listener: (frame: unknown) => void) => {
      emit = listener;
      return unsubscribe;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const post = (body: unknown) =>
    POST(new Request('http://localhost/api/voice/hermes', { method: 'POST', body: JSON.stringify(body) }) as never);

  it('streams the reply as chat-completion deltas and ends the turn once Hermes goes quiet', async () => {
    const response = await post({ chatId: CHAT_ID, text: 'What time is it?' });
    expect(sendToHermes).toHaveBeenCalledWith({
      user: { id: 'user-1', name: 'Ada' },
      chatId: CHAT_ID,
      text: 'What time is it?',
      voice: true,
    });

    emit({ kind: 'typing', content: null });
    emit({ kind: 'draft', draftId: 1, content: 'It is', final: false });
    emit({ kind: 'message', message: { parts: [{ type: 'text', text: 'It is noon.' }] } });
    await vi.advanceTimersByTimeAsync(3_000);

    const body = await response.text();
    const deltas = body
      .split('\n\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice('data: '.length)).choices[0].delta.content);
    expect(deltas).toEqual(['It is', ' noon.']);
    expect(body).toContain(': working');
    expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('reports an agent that stops without replying', async () => {
    const response = await post({ chatId: CHAT_ID, text: 'Hello' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await response.text()).toContain('Hermes stopped without replying');
  });

  it('answers the send error with its status, without streaming', async () => {
    sendToHermes.mockResolvedValue({ ok: false, status: 409, error: 'No Hermes connector enrolled' });
    const response = await post({ chatId: CHAT_ID, text: 'Hello' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'No Hermes connector enrolled' });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('rejects a request without a voice session or a valid body', async () => {
    expect((await post({ chatId: 'not-a-uuid', text: 'Hello' })).status).toBe(400);
    resolveVoiceRequestUserId.mockResolvedValue(null);
    expect((await post({ chatId: CHAT_ID, text: 'Hello' })).status).toBe(401);
  });
});
