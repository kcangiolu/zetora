import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getMessageById,
  updateMessagePartsById,
  updateMessageHermesReaction,
  saveMessages,
  publishHermesEvent,
  isHermesChatViewerActive,
  sendPushToUser,
} = vi.hoisted(() => ({
  getHermesConnectorByGatewayId: vi.fn(),
  getHermesConversationByChatId: vi.fn(),
  getMessageById: vi.fn(),
  updateMessagePartsById: vi.fn(),
  updateMessageHermesReaction: vi.fn(),
  saveMessages: vi.fn(),
  publishHermesEvent: vi.fn(),
  isHermesChatViewerActive: vi.fn(),
  sendPushToUser: vi.fn(),
}));

vi.mock('@/lib/hermes/internal-auth', () => ({ assertInternalHermesAuth: () => null }));
vi.mock('@/lib/hermes/feature-flag', () => ({ assertHermesEnabled: () => null }));
vi.mock('@/lib/db/queries', () => ({
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getMessageById,
  updateMessagePartsById,
  updateMessageHermesReaction,
  saveMessages,
}));
vi.mock('@/lib/hermes/realtime', () => ({ publishHermesEvent, isHermesChatViewerActive }));
vi.mock('@/lib/push/send-push', () => ({ sendPushToUser }));
// Constructed at module load, so it has to be stubbed before the route is imported.
vi.mock('@/lib/storage', () => ({
  getStorageClient: () => ({
    client: { send: vi.fn() },
    bucketName: 'test-bucket',
    publicUrl: 'https://storage.test',
  }),
}));

import { POST } from '@/app/api/internal/hermes/agent-event/route';

const CHAT_ID = 'chat-1';

const post = (action: Record<string, unknown>, gatewayId = 'gw-test') =>
  POST(
    new Request('http://localhost/api/internal/hermes/agent-event', {
      method: 'POST',
      body: JSON.stringify({ gatewayId, action }),
    }) as never,
  );

// The single part list handed to saveMessages by the last call.
const savedParts = () => saveMessages.mock.calls.at(-1)![0].messages[0].parts;

describe('POST /api/internal/hermes/agent-event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHermesConnectorByGatewayId.mockResolvedValue({ id: 'connector-1', userId: 'user-1', gatewayId: 'gw-test' });
    getHermesConversationByChatId.mockResolvedValue({ chatId: CHAT_ID, connectorId: 'connector-1' });
    isHermesChatViewerActive.mockResolvedValue(true);
    saveMessages.mockResolvedValue(undefined);
    publishHermesEvent.mockResolvedValue(undefined);
  });

  describe('routing and guards', () => {
    it('rejects an action with no chat_id rather than guessing a conversation', async () => {
      const res = await post({ op: 'send', content: 'hi' });
      expect(await res.json()).toEqual({ success: false, error: 'missing_chat_id' });
      expect(saveMessages).not.toHaveBeenCalled();
    });

    it('rejects a conversation belonging to a different connector', async () => {
      getHermesConversationByChatId.mockResolvedValue({ chatId: CHAT_ID, connectorId: 'other-connector' });
      const res = await post({ op: 'send', chat_id: CHAT_ID, content: 'hi' });
      expect(await res.json()).toEqual({ success: false, error: 'no_conversation' });
    });

    it('rejects an unknown op', async () => {
      const res = await post({ op: 'teleport', chat_id: CHAT_ID, content: 'hi' });
      expect(await res.json()).toEqual({ success: false, error: 'op_not_supported' });
      expect(saveMessages).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('persists the reply as a single text part', async () => {
      const res = await post({ op: 'send', chat_id: CHAT_ID, content: 'Bonjour' });
      expect(await res.json()).toMatchObject({ success: true });
      expect(savedParts()).toEqual([{ type: 'text', text: 'Bonjour' }]);
    });

    it('rejects an empty send', async () => {
      const res = await post({ op: 'send', chat_id: CHAT_ID });
      expect(await res.json()).toEqual({ success: false, error: 'missing_content' });
    });

    it('pushes only when no tab holds the chat open', async () => {
      isHermesChatViewerActive.mockResolvedValue(false);
      await post({ op: 'send', chat_id: CHAT_ID, content: 'Bonjour' });
      expect(sendPushToUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ body: 'Bonjour' }));

      vi.clearAllMocks();
      getHermesConnectorByGatewayId.mockResolvedValue({ id: 'connector-1', userId: 'user-1', gatewayId: 'gw-test' });
      getHermesConversationByChatId.mockResolvedValue({ chatId: CHAT_ID, connectorId: 'connector-1' });
      isHermesChatViewerActive.mockResolvedValue(true);
      await post({ op: 'send', chat_id: CHAT_ID, content: 'Bonjour' });
      expect(sendPushToUser).not.toHaveBeenCalled();
    });
  });

  describe('provenance and response time', () => {
    const savedMessage = () => saveMessages.mock.calls.at(-1)![0].messages[0];

    it('records which gateway produced the reply', async () => {
      await post({ op: 'send', chat_id: CHAT_ID, content: 'Bonjour' });
      expect(savedMessage().hermesGatewayId).toBe('gw-test');
    });

    it('times the reply from the user message it answers', async () => {
      const askedAt = new Date(Date.now() - 12_000);
      getMessageById.mockResolvedValue([{ id: 'u1', chatId: CHAT_ID, role: 'user', createdAt: askedAt }]);
      await post({ op: 'send', chat_id: CHAT_ID, content: 'Bonjour', reply_to: 'u1' });

      expect(getMessageById).toHaveBeenCalledWith({ id: 'u1' });
      const { completionTime, createdAt } = savedMessage();
      expect(completionTime).toBeCloseTo((createdAt.getTime() - askedAt.getTime()) / 1000);
      expect(publishHermesEvent).toHaveBeenCalledWith(
        CHAT_ID,
        expect.objectContaining({
          message: expect.objectContaining({ metadata: { completionTime, hermesGatewayId: 'gw-test' } }),
        }),
      );
    });

    it('leaves a send with no reply_to untimed', async () => {
      await post({ op: 'send', chat_id: CHAT_ID, content: 'Scheduled digest' });
      expect(getMessageById).not.toHaveBeenCalled();
      expect(savedMessage().completionTime).toBeNull();
    });

    it('ignores a reply_to that is not a user message in this chat', async () => {
      getMessageById.mockResolvedValue([{ id: 'x', chatId: 'some-other-chat', role: 'user', createdAt: new Date() }]);
      await post({ op: 'send', chat_id: CHAT_ID, content: 'Bonjour', reply_to: 'x' });
      expect(savedMessage().completionTime).toBeNull();

      getMessageById.mockResolvedValue([{ id: 'a', chatId: CHAT_ID, role: 'assistant', createdAt: new Date() }]);
      await post({ op: 'send', chat_id: CHAT_ID, content: 'Bonjour', reply_to: 'a' });
      expect(savedMessage().completionTime).toBeNull();
    });
  });

  describe('prompt', () => {
    it('defaults the button expiry to 5 minutes out', async () => {
      const before = Date.now();
      await post({
        op: 'prompt',
        chat_id: CHAT_ID,
        content: 'Run it?',
        prompt_id: 'p1',
        options: [{ id: 'yes', label: 'Yes' }],
      });

      const [text, prompt] = savedParts();
      expect(text).toEqual({ type: 'text', text: 'Run it?' });
      expect(prompt.type).toBe('data-hermes_prompt');
      expect(prompt.data.promptKind).toBe('choice');
      // Hermes's slash_confirm.py uses 300s; past it a button press silently no-ops there,
      // so the UI has to know when to stop offering the buttons.
      expect(prompt.data.expiresAt).toBeGreaterThanOrEqual(before + 300_000);
      expect(prompt.data.expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
    });

    it('honours an explicit timeout_s', async () => {
      const before = Date.now();
      await post({
        op: 'prompt',
        chat_id: CHAT_ID,
        content: 'Run it?',
        prompt_id: 'p1',
        options: [{ id: 'yes', label: 'Yes' }],
        timeout_s: 30,
      });

      const prompt = savedParts()[1];
      expect(prompt.data.expiresAt).toBeGreaterThanOrEqual(before + 30_000);
      expect(prompt.data.expiresAt).toBeLessThanOrEqual(Date.now() + 30_000);
    });

    it('rejects a prompt with no options', async () => {
      const res = await post({ op: 'prompt', chat_id: CHAT_ID, content: 'Run it?', prompt_id: 'p1' });
      expect(await res.json()).toEqual({ success: false, error: 'missing_content' });
    });
  });

  describe('send_media', () => {
    const relayUrl = (target: string) =>
      `https://relay.test/relay/media/${Buffer.from(target, 'utf8').toString('base64url')}`;

    it('resolves a relay-media reference back to the stored URL without re-fetching', async () => {
      await post({
        op: 'send_media',
        chat_id: CHAT_ID,
        media_kind: 'voice',
        source_url: relayUrl('https://storage.test/zetora/hermes-media/user-1/voice.ogg'),
      });

      expect(savedParts()).toEqual([
        {
          type: 'data-hermes_media',
          data: {
            mediaKind: 'voice',
            url: 'https://storage.test/zetora/hermes-media/user-1/voice.ogg',
            filename: null,
            caption: null,
          },
        },
      ]);
    });

    it("refuses a relay-media reference outside the owner's media prefix", async () => {
      for (const target of [
        'http://169.254.169.254/latest/meta-data/',
        'https://storage.test/zetora/hermes-media/user-2/pic.png',
        'https://storage.test/zetora/users/user-1/upload.png',
        'https://storage.test/zetora/hermes-media/user-1/../../users/user-2/x.png',
      ]) {
        const res = await post({
          op: 'send_media',
          chat_id: CHAT_ID,
          media_kind: 'image',
          source_url: relayUrl(target),
        });
        expect(await res.json()).toEqual({ success: false, error: 'media_fetch_failed' });
      }
    });

    it('treats an empty caption as no caption', async () => {
      // adapter.py's _send_media always sends `content: caption or ""`, never omits it.
      await post({
        op: 'send_media',
        chat_id: CHAT_ID,
        media_kind: 'image',
        source_url: relayUrl('https://storage.test/zetora/hermes-media/user-1/pic.png'),
        content: '',
      });

      expect(savedParts()[0].data.caption).toBeNull();
    });

    it('keeps a real caption', async () => {
      await post({
        op: 'send_media',
        chat_id: CHAT_ID,
        media_kind: 'image',
        source_url: relayUrl('https://storage.test/zetora/hermes-media/user-1/pic.png'),
        content: 'Look at this',
      });

      expect(savedParts()[0].data.caption).toBe('Look at this');
    });
  });

  describe('edit', () => {
    it('refuses to edit a message belonging to another chat', async () => {
      getMessageById.mockResolvedValue([{ id: 'm1', chatId: 'some-other-chat' }]);
      const res = await post({ op: 'edit', chat_id: CHAT_ID, message_id: 'm1', content: 'edited' });
      expect(await res.json()).toEqual({ success: false, error: 'unknown_message' });
      expect(updateMessagePartsById).not.toHaveBeenCalled();
    });

    it('rewrites the message parts in place', async () => {
      getMessageById.mockResolvedValue([{ id: 'm1', chatId: CHAT_ID }]);
      const res = await post({ op: 'edit', chat_id: CHAT_ID, message_id: 'm1', content: 'edited' });
      expect(await res.json()).toEqual({ success: true });
      expect(updateMessagePartsById).toHaveBeenCalledWith({
        id: 'm1',
        parts: [{ type: 'text', text: 'edited' }],
      });
    });
  });

  describe('react', () => {
    it('clears the reaction when remove is set', async () => {
      getMessageById.mockResolvedValue([{ id: 'm1', chatId: CHAT_ID }]);
      await post({ op: 'react', chat_id: CHAT_ID, message_id: 'm1', emoji: '👀', remove: true });
      expect(updateMessageHermesReaction).toHaveBeenCalledWith({ id: 'm1', emoji: null });
    });

    it('stores the emoji otherwise', async () => {
      getMessageById.mockResolvedValue([{ id: 'm1', chatId: CHAT_ID }]);
      await post({ op: 'react', chat_id: CHAT_ID, message_id: 'm1', emoji: '👀' });
      expect(updateMessageHermesReaction).toHaveBeenCalledWith({ id: 'm1', emoji: '👀' });
    });
  });

  describe('typing', () => {
    it('publishes a heartbeat without persisting anything', async () => {
      const res = await post({ op: 'typing', chat_id: CHAT_ID, content: 'Finding answers…' });
      expect(await res.json()).toEqual({ success: true });
      expect(publishHermesEvent).toHaveBeenCalledWith(CHAT_ID, { kind: 'typing', content: 'Finding answers…' });
      expect(saveMessages).not.toHaveBeenCalled();
    });
  });

  describe('draft', () => {
    it('publishes the partial text without persisting or notifying', async () => {
      const res = await post({ op: 'draft', chat_id: CHAT_ID, draft_id: 42, content: 'Let me ch' });
      expect(await res.json()).toEqual({ success: true });
      expect(publishHermesEvent).toHaveBeenCalledWith(CHAT_ID, {
        kind: 'draft',
        draftId: 42,
        content: 'Let me ch',
        final: false,
      });
      // A draft is not a message: nothing is stored, and the push belongs to the `send`
      // that eventually delivers the finished segment.
      expect(saveMessages).not.toHaveBeenCalled();
      expect(updateMessagePartsById).not.toHaveBeenCalled();
      expect(sendPushToUser).not.toHaveBeenCalled();
    });

    it('forwards a sealing frame as final', async () => {
      await post({ op: 'draft', chat_id: CHAT_ID, draft_id: 42, content: 'done', final: true });
      expect(publishHermesEvent).toHaveBeenCalledWith(CHAT_ID, {
        kind: 'draft',
        draftId: 42,
        content: 'done',
        final: true,
      });
      expect(saveMessages).not.toHaveBeenCalled();
    });

    it('refuses a frame for a chat this connector does not own', async () => {
      getHermesConversationByChatId.mockResolvedValue({ chatId: CHAT_ID, connectorId: 'other-connector' });
      const res = await post({ op: 'draft', chat_id: CHAT_ID, draft_id: 42, content: 'nope' });
      expect(await res.json()).toEqual({ success: false, error: 'no_conversation' });
      expect(publishHermesEvent).not.toHaveBeenCalled();
    });
  });
});
