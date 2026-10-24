import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  afterCallbacks,
  resolveVoiceRequestUserId,
  getChatByIdForValidation,
  getHermesChatLock,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  generateTitleFromUserMessage,
} = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  resolveVoiceRequestUserId: vi.fn(),
  getChatByIdForValidation: vi.fn(),
  getHermesChatLock: vi.fn(),
  getMessagesByChatId: vi.fn(),
  saveChat: vi.fn(),
  saveMessages: vi.fn(),
  updateChatTitleById: vi.fn(),
  generateTitleFromUserMessage: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => Promise<void>) => afterCallbacks.push(callback),
}));
vi.mock('@/lib/voice-session-token', () => ({ resolveVoiceRequestUserId }));
vi.mock('@/lib/db/queries', () => ({
  getChatByIdForValidation,
  getHermesChatLock,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
}));
vi.mock('@/lib/search/chat-title', () => ({ generateTitleFromUserMessage, UNTITLED_CHAT_TITLE: 'New Chat' }));

import { GET, POST } from '@/app/api/voice/transcript/route';
import { NextRequest } from 'next/server';

const CHAT_ID = '6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const TURN = [
  { role: 'user', text: 'What is the capital of France?' },
  { role: 'assistant', text: 'Paris.' },
];

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/voice/transcript', { method: 'POST', body: JSON.stringify(body) }) as never);

describe('POST /api/voice/transcript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    resolveVoiceRequestUserId.mockResolvedValue('user-1');
    getChatByIdForValidation.mockResolvedValue(null);
    getHermesChatLock.mockResolvedValue('search');
    generateTitleFromUserMessage.mockResolvedValue('Capital of France');
  });

  it('creates the chat on the first turn, saves both messages in order and titles it', async () => {
    expect((await post({ chatId: CHAT_ID, messages: TURN })).status).toBe(200);
    expect(saveChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: CHAT_ID, userId: 'user-1', title: 'What is the capital of France?' }),
    );
    const saved = saveMessages.mock.calls[0][0].messages;
    expect(saved.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(saved[1].createdAt.getTime()).toBeGreaterThan(saved[0].createdAt.getTime());

    await Promise.all(afterCallbacks.map((callback) => callback()));
    expect(updateChatTitleById).toHaveBeenCalledWith({ chatId: CHAT_ID, title: 'Capital of France' });
  });

  it("adds to the user's existing chat without creating or renaming it", async () => {
    getChatByIdForValidation.mockResolvedValue({ id: CHAT_ID, userId: 'user-1' });
    await post({ chatId: CHAT_ID, messages: TURN });
    expect(saveChat).not.toHaveBeenCalled();
    expect(saveMessages).toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("refuses another user's chat, a Hermes chat and a malformed turn", async () => {
    getChatByIdForValidation.mockResolvedValueOnce({ id: CHAT_ID, userId: 'user-2' });
    expect((await post({ chatId: CHAT_ID, messages: TURN })).status).toBe(404);

    getChatByIdForValidation.mockResolvedValueOnce({ id: CHAT_ID, userId: 'user-1' });
    getHermesChatLock.mockResolvedValueOnce('hermes');
    expect((await post({ chatId: CHAT_ID, messages: TURN })).status).toBe(409);

    expect((await post({ chatId: CHAT_ID, messages: [] })).status).toBe(400);
    expect(saveMessages).not.toHaveBeenCalled();
  });

  it('rejects a request without a voice session', async () => {
    resolveVoiceRequestUserId.mockResolvedValue(null);
    expect((await post({ chatId: CHAT_ID, messages: TURN })).status).toBe(401);
  });
});

describe('GET /api/voice/transcript', () => {
  const get = (chatId: string) => GET(new NextRequest(`http://localhost/api/voice/transcript?chatId=${chatId}`));

  beforeEach(() => {
    vi.clearAllMocks();
    resolveVoiceRequestUserId.mockResolvedValue('user-1');
    getChatByIdForValidation.mockResolvedValue({ id: CHAT_ID, userId: 'user-1' });
    getHermesChatLock.mockResolvedValue('search');
  });

  it('returns who answers the chat and its latest text messages, without tools, summaries or empty ones', async () => {
    getMessagesByChatId.mockResolvedValue([
      { role: 'user', parts: [{ type: 'text', text: 'Plan a trip to Rome' }], isCompactionSummary: false },
      { role: 'tool', parts: [{ type: 'text', text: 'raw tool output' }], isCompactionSummary: false },
      { role: 'assistant', parts: [{ type: 'text', text: 'Earlier, in short' }], isCompactionSummary: true },
      {
        role: 'assistant',
        parts: [
          { type: 'tool-web_search', input: {} },
          { type: 'text', text: 'Day one: the Colosseum.' },
        ],
        isCompactionSummary: false,
      },
      { role: 'assistant', parts: [{ type: 'file', url: 'x' }], isCompactionSummary: false },
    ]);
    const response = await get(CHAT_ID);
    expect(await response.json()).toEqual({
      agent: 'zetora',
      messages: [
        { role: 'user', content: 'Plan a trip to Rome' },
        { role: 'assistant', content: 'Day one: the Colosseum.' },
      ],
    });
    expect(getMessagesByChatId).toHaveBeenCalledWith({ id: CHAT_ID, limit: 20, mostRecent: true });
  });

  it('names Hermes as the agent of a Hermes chat, so voice continues it only with Hermes', async () => {
    getHermesChatLock.mockResolvedValue('hermes');
    getMessagesByChatId.mockResolvedValue([
      { role: 'user', parts: [{ type: 'text', text: 'Remind me tomorrow' }], isCompactionSummary: false },
      { role: 'assistant', parts: [{ type: 'text', text: 'Done.' }], isCompactionSummary: false },
    ]);
    expect(await (await get(CHAT_ID)).json()).toEqual({
      agent: 'hermes',
      messages: [
        { role: 'user', content: 'Remind me tomorrow' },
        { role: 'assistant', content: 'Done.' },
      ],
    });
  });

  it("refuses another user's chat and a request without a voice session", async () => {
    getChatByIdForValidation.mockResolvedValueOnce({ id: CHAT_ID, userId: 'user-2' });
    expect((await get(CHAT_ID)).status).toBe(404);
    resolveVoiceRequestUserId.mockResolvedValueOnce(null);
    expect((await get(CHAT_ID)).status).toBe(401);
    expect(getMessagesByChatId).not.toHaveBeenCalled();
  });
});
