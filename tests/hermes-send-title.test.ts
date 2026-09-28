import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  afterCallbacks,
  getSession,
  getChatByIdForValidation,
  getHermesChatLock,
  getHermesConnectorByUserId,
  getHermesConversationByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  deliverToGateway,
  publishHermesEvent,
  generateTitleFromUserMessage,
} = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  getSession: vi.fn(),
  getChatByIdForValidation: vi.fn(),
  getHermesChatLock: vi.fn(),
  getHermesConnectorByUserId: vi.fn(),
  getHermesConversationByChatId: vi.fn(),
  saveChat: vi.fn(),
  saveMessages: vi.fn(),
  updateChatTitleById: vi.fn(),
  deliverToGateway: vi.fn(),
  publishHermesEvent: vi.fn(),
  generateTitleFromUserMessage: vi.fn(),
}));

// `after` runs its callback once the response is sent; collecting it lets each test run
// the background work explicitly and assert on what it did.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => Promise<void>) => afterCallbacks.push(callback),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/hermes/feature-flag', () => ({ assertHermesEnabled: () => null }));
vi.mock('@/lib/db/queries', () => ({
  getChatByIdForValidation,
  getHermesChatLock,
  getHermesConnectorByUserId,
  getHermesConversationByChatId,
  createHermesConversation: vi.fn(),
  saveChat,
  saveMessages,
  updateChatTitleById,
}));
vi.mock('@/lib/hermes/relay-client', () => ({ deliverToGateway }));
vi.mock('@/lib/hermes/realtime', () => ({ publishHermesEvent }));
vi.mock('@/lib/search/chat-title', () => ({ generateTitleFromUserMessage, UNTITLED_CHAT_TITLE: 'New Chat' }));
// Constructed at module load, so it has to be stubbed before the route is imported.
vi.mock('@/lib/storage', () => ({
  getStorageClient: () => ({ client: { send: vi.fn() }, bucketName: 'test-bucket', publicUrl: 'https://storage.test' }),
}));

import { POST } from '@/app/api/hermes/send/route';

const CHAT_ID = 'chat-1';

const send = (body: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/hermes/send', {
      method: 'POST',
      body: JSON.stringify({ chatId: CHAT_ID, ...body }),
    }) as never,
  );

const runAfterCallbacks = () => Promise.all(afterCallbacks.map((callback) => callback()));

describe('POST /api/hermes/send — chat title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    getSession.mockResolvedValue({ user: { id: 'user-1', name: 'Kenny' } });
    getChatByIdForValidation.mockResolvedValue(null);
    getHermesConnectorByUserId.mockResolvedValue({ id: 'connector-1', status: 'enrolled', gatewayId: 'gw-test' });
    getHermesConversationByChatId.mockResolvedValue({ chatId: CHAT_ID, connectorId: 'connector-1' });
    deliverToGateway.mockResolvedValue({ success: true });
  });

  it('creates a new chat under a provisional title, then replaces it with the generated one', async () => {
    generateTitleFromUserMessage.mockResolvedValue('Planification du déploiement');
    await send({ text: 'Peux-tu préparer le déploiement de demain ?' });

    expect(saveChat).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Peux-tu préparer le déploiement de demain ?' }),
    );

    await runAfterCallbacks();
    expect(generateTitleFromUserMessage).toHaveBeenCalledWith({
      message: expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'Peux-tu préparer le déploiement de demain ?' }],
      }),
    });
    expect(updateChatTitleById).toHaveBeenCalledWith({ chatId: CHAT_ID, title: 'Planification du déploiement' });
    expect(publishHermesEvent).toHaveBeenCalledWith(CHAT_ID, { kind: 'title', title: 'Planification du déploiement' });
  });

  it('keeps the provisional title when generation yields no title', async () => {
    generateTitleFromUserMessage.mockResolvedValue('New Chat');
    await send({ text: 'Bonjour' });
    await runAfterCallbacks();

    expect(updateChatTitleById).not.toHaveBeenCalled();
    expect(publishHermesEvent).not.toHaveBeenCalled();
  });

  it('keeps the provisional title when generation fails', async () => {
    generateTitleFromUserMessage.mockRejectedValue(new Error('model unavailable'));
    await send({ text: 'Bonjour' });
    await runAfterCallbacks();

    expect(updateChatTitleById).not.toHaveBeenCalled();
    expect(publishHermesEvent).not.toHaveBeenCalled();
  });

  it('does not retitle an existing chat', async () => {
    getChatByIdForValidation.mockResolvedValue({ id: CHAT_ID, userId: 'user-1' });
    getHermesChatLock.mockResolvedValue('hermes');
    await send({ text: 'Et maintenant ?' });

    expect(afterCallbacks).toHaveLength(0);
    expect(generateTitleFromUserMessage).not.toHaveBeenCalled();
  });

  it('keeps the file name as title for an attachment-only first message', async () => {
    await send({
      attachments: [
        { url: 'https://storage.test/zetora/users/user-1/abc.pdf', name: 'rapport.pdf', mediaType: 'application/pdf' },
      ],
    });

    expect(saveChat).toHaveBeenCalledWith(expect.objectContaining({ title: 'rapport.pdf' }));
    expect(afterCallbacks).toHaveLength(0);
  });
});
