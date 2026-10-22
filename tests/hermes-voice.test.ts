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

  it('speaks the final reply of a turn end only when its message has not been spoken', () => {
    const before = new HermesSpeechTracker();
    expect(before.draft(1, 'Done')).toBe('Done');
    expect(before.turnEnd('Done.')).toBe('.');

    const after = new HermesSpeechTracker();
    expect(after.message('Done.')).toBe('Done.');
    expect(after.turnEnd('Done.')).toBe('');

    const noMessage = new HermesSpeechTracker();
    expect(noMessage.message('Let me check.')).toBe('Let me check.');
    expect(noMessage.turnEnd('It is sunny.')).toBe('It is sunny.');
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

  const dataChunks = (body: string) =>
    body
      .split('\n\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice('data: '.length)));

  it('streams the reply as chat-completion deltas and ends with the turn', async () => {
    const response = await post({ chatId: CHAT_ID, text: 'What time is it?' });
    expect(sendToHermes).toHaveBeenCalledWith({
      user: { id: 'user-1', name: 'Ada' },
      chatId: CHAT_ID,
      text: 'What time is it?',
      voice: true,
    });

    emit({ kind: 'typing', content: null });
    emit({
      kind: 'tool_step',
      step: { toolCallId: 'c-1', toolName: 'web_search', preview: 'time', status: 'running', durationMs: null },
    });
    emit({ kind: 'draft', draftId: 1, content: 'It is', final: false });
    emit({ kind: 'turn_end', response: 'It is noon.' });
    // The final message lands after the turn's end: already spoken.
    emit({ kind: 'message', message: { parts: [{ type: 'text', text: 'It is noon.' }] } });

    const body = await response.text();
    const chunks = dataChunks(body);
    expect(chunks[0]).toEqual({ tool: { callId: 'c-1', name: 'web_search', preview: 'time', status: 'running' } });
    expect(chunks.slice(1).map((chunk) => chunk.choices[0].delta.content)).toEqual(['It is', ' noon.']);
    expect(body).toContain(': working');
    expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(unsubscribe).toHaveBeenCalled();
    expect(sendToHermes).toHaveBeenCalledTimes(1);
  });

  it('stops the Hermes turn when the caller hangs up before it ends', async () => {
    const controller = new AbortController();
    await POST(
      new Request('http://localhost/api/voice/hermes', {
        method: 'POST',
        body: JSON.stringify({ chatId: CHAT_ID, text: 'Tell me a story' }),
        signal: controller.signal,
      }) as never,
    );
    controller.abort();
    expect(sendToHermes).toHaveBeenLastCalledWith({
      user: { id: 'user-1', name: 'Ada' },
      chatId: CHAT_ID,
      text: '/stop',
    });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('ends the turn after a long silence when no turn end comes', async () => {
    const response = await post({ chatId: CHAT_ID, text: 'Hello' });
    emit({ kind: 'message', message: { parts: [{ type: 'text', text: 'Hi.' }] } });
    await vi.advanceTimersByTimeAsync(15_000);
    const body = await response.text();
    expect(dataChunks(body).map((chunk) => chunk.choices[0].delta.content)).toEqual(['Hi.']);
    expect(body).not.toContain('error');
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
