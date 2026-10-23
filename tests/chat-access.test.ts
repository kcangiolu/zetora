import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getUser,
  getChatByIdForValidation,
  getChatWithUserById,
  getChatsByUserId,
  getRecentChatsByUserId,
  deleteChatById,
  updateChatVisibilityById,
  updateChatTitleById,
  updateChatPinnedById,
  getComprehensiveUserData,
  findMessages,
  saveChat,
  saveMessages,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getChatByIdForValidation: vi.fn(),
  getChatWithUserById: vi.fn(),
  getChatsByUserId: vi.fn(),
  getRecentChatsByUserId: vi.fn(),
  deleteChatById: vi.fn(),
  updateChatVisibilityById: vi.fn(),
  updateChatTitleById: vi.fn(),
  updateChatPinnedById: vi.fn(),
  getComprehensiveUserData: vi.fn(),
  findMessages: vi.fn(),
  saveChat: vi.fn(),
  saveMessages: vi.fn(),
}));

vi.mock('@/lib/auth-utils', () => ({ getUser }));
vi.mock('@/lib/db', () => ({ db: { query: { message: { findMany: findMessages } } }, maindb: {} }));
vi.mock('@/lib/user-data-server', () => ({ getComprehensiveUserData }));
vi.mock('@/lib/search/chat-title', () => ({ generateTitleFromUserMessage: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({
  getChatByIdForValidation,
  getChatWithUserById,
  getChatsByUserId,
  getRecentChatsByUserId,
  deleteChatById,
  updateChatVisibilityById,
  updateChatTitleById,
  updateChatPinnedById,
  getChatById: vi.fn(),
  getMessageById: vi.fn(),
  deleteMessagesByChatIdAfterTimestamp: vi.fn(),
  updateMessagePartsById: vi.fn(),
  hideContextImage: vi.fn(),
  unhideContextImage: vi.fn(),
  saveChat,
  saveMessages,
}));

import {
  branchOutChat,
  bulkDeleteChats,
  deleteChat,
  getRecentChats,
  getUserChats,
  loadMoreChats,
  updateChatPinned,
  updateChatTitle,
  updateChatVisibility,
} from '@/app/actions/chats';
import { getChatMeta } from '@/app/actions/user';

const OWNER = { id: 'owner-1' };
const STRANGER = { id: 'stranger-1' };

beforeEach(() => {
  vi.clearAllMocks();
  getChatByIdForValidation.mockResolvedValue({ id: 'chat-1', userId: OWNER.id });
});

describe('chat mutations', () => {
  const mutations: Array<[string, () => Promise<unknown>, ReturnType<typeof vi.fn>]> = [
    ['deleteChat', () => deleteChat('chat-1'), deleteChatById],
    ['updateChatTitle', () => updateChatTitle('chat-1', 'New title'), updateChatTitleById],
    ['updateChatPinned', () => updateChatPinned('chat-1', true), updateChatPinnedById],
    ['updateChatVisibility', () => updateChatVisibility('chat-1', 'public'), updateChatVisibilityById],
  ];

  it.each(mutations)('%s refuses a request without a session', async (_name, run, query) => {
    getUser.mockResolvedValue(null);
    await run().catch(() => undefined);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(mutations)("%s refuses someone else's chat", async (_name, run, query) => {
    getUser.mockResolvedValue(STRANGER);
    await run().catch(() => undefined);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(mutations)('%s goes through for the owner', async (_name, run, query) => {
    getUser.mockResolvedValue(OWNER);
    query.mockResolvedValue({ rowCount: 1 });
    await run();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('bulkDeleteChats deletes nothing when one chat belongs to someone else', async () => {
    getUser.mockResolvedValue(OWNER);
    getChatByIdForValidation.mockImplementation(async ({ id }: { id: string }) => ({
      id,
      userId: id === 'foreign' ? STRANGER.id : OWNER.id,
    }));
    await expect(bulkDeleteChats(['mine', 'foreign'])).rejects.toThrow();
    expect(deleteChatById).not.toHaveBeenCalled();
  });
});

describe('branchOutChat', () => {
  const stored = (id: string, role: 'user' | 'assistant', minute: number) => ({
    id,
    chatId: 'chat-1',
    role,
    parts: [{ type: 'text', text: id }],
    attachments: [],
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
    model: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    completionTime: null,
    searchVector: null,
    isCompactionSummary: false,
    compactionReplacedCount: null,
    hermesReaction: null,
    hermesGatewayId: 'gateway-1',
  });
  const history = [
    stored('q1', 'user', 1),
    stored('a1', 'assistant', 2),
    stored('q2', 'user', 3),
    stored('a2', 'assistant', 4),
    stored('q3', 'user', 5),
    stored('a3', 'assistant', 6),
  ];

  beforeEach(() => {
    findMessages.mockResolvedValue(history);
  });

  it('copies the conversation up to and including the chosen answer', async () => {
    getComprehensiveUserData.mockResolvedValue(OWNER);
    const result = await branchOutChat({ chatId: 'chat-1', messageId: 'a2' });

    expect(result.success).toBe(true);
    const [{ messages }] = saveMessages.mock.calls[0];
    expect(messages.map((m: { parts: Array<{ text: string }> }) => m.parts[0].text)).toEqual(['q1', 'a1', 'q2', 'a2']);
    for (const copy of messages) {
      expect(copy.chatId).toBe(result.chatId);
      expect(copy.hermesGatewayId).toBeNull();
      expect(history.map((m) => m.id)).not.toContain(copy.id);
    }
    expect(saveChat).toHaveBeenCalledWith(expect.objectContaining({ id: result.chatId, userId: OWNER.id }));
  });

  it("refuses someone else's chat", async () => {
    getComprehensiveUserData.mockResolvedValue(STRANGER);
    await expect(branchOutChat({ chatId: 'chat-1', messageId: 'a2' })).resolves.toMatchObject({ success: false });
    expect(findMessages).not.toHaveBeenCalled();
    expect(saveMessages).not.toHaveBeenCalled();
  });

  it('refuses a message that is not an answer of this chat', async () => {
    getComprehensiveUserData.mockResolvedValue(OWNER);
    await expect(branchOutChat({ chatId: 'chat-1', messageId: 'q2' })).resolves.toMatchObject({ success: false });
    await expect(branchOutChat({ chatId: 'chat-1', messageId: 'other' })).resolves.toMatchObject({ success: false });
    expect(saveMessages).not.toHaveBeenCalled();
  });
});

describe('chat lists', () => {
  it('list the chats of the signed-in user only', async () => {
    getUser.mockResolvedValue(OWNER);
    getRecentChatsByUserId.mockResolvedValue({ chats: [], hasMore: false });
    getChatsByUserId.mockResolvedValue({ chats: [], hasMore: false });

    await getRecentChats(8);
    await getUserChats(30);
    await loadMoreChats('chat-9', 30);

    expect(getRecentChatsByUserId).toHaveBeenCalledWith({ userId: OWNER.id, limit: 8 });
    for (const [args] of getChatsByUserId.mock.calls) {
      expect(args.id).toBe(OWNER.id);
    }
  });

  it('return nothing without a session', async () => {
    getUser.mockResolvedValue(null);
    await expect(getRecentChats(8)).resolves.toEqual({ chats: [], hasMore: false });
    await expect(getUserChats(30)).resolves.toEqual({ chats: [], hasMore: false });
    await expect(loadMoreChats('chat-9', 30)).resolves.toEqual({ chats: [], hasMore: false });
    expect(getRecentChatsByUserId).not.toHaveBeenCalled();
    expect(getChatsByUserId).not.toHaveBeenCalled();
  });
});

describe('getChatMeta', () => {
  const row = (visibility: 'public' | 'private') => ({
    id: 'chat-1',
    title: 'Title',
    visibility,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: OWNER.id,
    userName: 'Owner',
    userEmail: 'owner@example.com',
    userImage: null,
  });

  it('hides a private chat from anyone but its owner', async () => {
    getChatWithUserById.mockResolvedValue(row('private'));
    getUser.mockResolvedValue(null);
    await expect(getChatMeta('chat-1')).resolves.toBeNull();
    getUser.mockResolvedValue(STRANGER);
    await expect(getChatMeta('chat-1')).resolves.toBeNull();
  });

  it("never returns the owner's id or email", async () => {
    getChatWithUserById.mockResolvedValue(row('public'));
    getUser.mockResolvedValue(STRANGER);
    const meta = await getChatMeta('chat-1');
    expect(meta?.isOwner).toBe(false);
    expect(meta?.user).toEqual({ name: 'Owner', image: null });
    expect(JSON.stringify(meta)).not.toContain('owner@example.com');
    expect(JSON.stringify(meta)).not.toContain(OWNER.id);
  });

  it('marks the owner from the session', async () => {
    getChatWithUserById.mockResolvedValue(row('private'));
    getUser.mockResolvedValue(OWNER);
    await expect(getChatMeta('chat-1')).resolves.toMatchObject({ isOwner: true });
  });
});
