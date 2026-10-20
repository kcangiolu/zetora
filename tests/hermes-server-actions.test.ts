import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hermes is off unless the build turns it on.
process.env.NEXT_PUBLIC_HERMES_ENABLED = 'true';

const {
  getCurrentUser,
  getHermesConnectorByUserId,
  getHermesConversationByChatId,
  getMessageById,
  getChatByIdForValidation,
  deleteMessageById,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getHermesConnectorByUserId: vi.fn(),
  getHermesConversationByChatId: vi.fn(),
  getMessageById: vi.fn(),
  getChatByIdForValidation: vi.fn(),
  deleteMessageById: vi.fn(),
}));

vi.mock('@/app/actions/user', () => ({ getCurrentUser }));
vi.mock('@/lib/db/queries/hermes', () => ({
  getHermesConnectorByUserId,
  getHermesConversationByChatId,
  createHermesConnector: vi.fn(),
  revokeHermesConnector: vi.fn(),
}));
vi.mock('@/lib/db/queries/chat', () => ({ getMessageById, getChatByIdForValidation, deleteMessageById }));

import { getHermesConnectorStatusAction, hideHermesMessageAction } from '@/app/actions/hermes';

// The whole point of these: a failure must NOT come back as a resolved value carrying
// `connector: null`. React Query caches a resolved failure as real data — no error state, no
// retry — and every caller reads it as "this user was never enrolled", which is what
// silently kicked live Agent chats out of Agent mode.
describe('getHermesConnectorStatusAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when there is no session instead of reporting "no connector"', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(getHermesConnectorStatusAction()).rejects.toThrow('Authentication required');
  });

  it('lets a database failure propagate instead of swallowing it', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getHermesConnectorByUserId.mockRejectedValue(new Error('connection refused'));
    await expect(getHermesConnectorStatusAction()).rejects.toThrow('connection refused');
  });

  it('reports a genuinely unenrolled user as a successful null connector', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getHermesConnectorByUserId.mockResolvedValue(null);
    await expect(getHermesConnectorStatusAction()).resolves.toEqual({ connector: null });
  });

  it('returns the enrollment fields the UI renders, and nothing else', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getHermesConnectorByUserId.mockResolvedValue({
      id: 'connector-1',
      userId: 'user-1',
      status: 'enrolled',
      label: 'laptop',
      gatewaySecretPrefix: 'abc123',
      gatewaySecretEncrypted: 'must-not-leak',
      enrollmentTokenHash: 'must-not-leak',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
    });

    const result = await getHermesConnectorStatusAction();
    expect(result.connector).toEqual({
      status: 'enrolled',
      label: 'laptop',
      gatewaySecretPrefix: 'abc123',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
    });
  });
});

describe('hideHermesMessageAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getMessageById.mockResolvedValue([{ id: 'msg-1', chatId: 'chat-1' }]);
    getChatByIdForValidation.mockResolvedValue({ id: 'chat-1', userId: 'user-1' });
    getHermesConversationByChatId.mockResolvedValue({ chatId: 'chat-1' });
  });

  it("removes Zetora's copy of a message in the user's own Agent chat", async () => {
    await expect(hideHermesMessageAction({ messageId: 'msg-1' })).resolves.toEqual({ success: true });
    expect(deleteMessageById).toHaveBeenCalledWith({ id: 'msg-1' });
  });

  it("refuses a message in someone else's chat", async () => {
    getChatByIdForValidation.mockResolvedValue({ id: 'chat-1', userId: 'user-2' });
    await expect(hideHermesMessageAction({ messageId: 'msg-1' })).resolves.toMatchObject({ success: false });
    expect(deleteMessageById).not.toHaveBeenCalled();
  });

  it('refuses a message outside an Agent conversation', async () => {
    getHermesConversationByChatId.mockResolvedValue(null);
    await expect(hideHermesMessageAction({ messageId: 'msg-1' })).resolves.toEqual({
      success: false,
      error: 'Not an Agent conversation',
    });
    expect(deleteMessageById).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(hideHermesMessageAction({ messageId: 'msg-1' })).resolves.toMatchObject({ success: false });
    expect(deleteMessageById).not.toHaveBeenCalled();
  });
});
