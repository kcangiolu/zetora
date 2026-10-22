import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getHermesConnectorByGatewayId, getHermesConversationByChatId, publishHermesEvent } = vi.hoisted(() => ({
  getHermesConnectorByGatewayId: vi.fn(),
  getHermesConversationByChatId: vi.fn(),
  publishHermesEvent: vi.fn(),
}));

vi.mock('@/lib/hermes/internal-auth', () => ({ assertInternalHermesAuth: () => null }));
vi.mock('@/lib/hermes/feature-flag', () => ({ assertHermesEnabled: () => null }));
vi.mock('@/lib/db/queries', () => ({ getHermesConnectorByGatewayId, getHermesConversationByChatId }));
vi.mock('@/lib/hermes/realtime', () => ({ publishHermesEvent }));

import { POST } from '@/app/api/internal/hermes/turn-event/route';

const post = (event: unknown) =>
  POST(
    new Request('http://localhost/api/internal/hermes/turn-event', {
      method: 'POST',
      body: JSON.stringify({ gatewayId: 'gw-1', event }),
    }) as never,
  );

describe('POST /api/internal/hermes/turn-event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHermesConnectorByGatewayId.mockResolvedValue({ id: 'conn-1' });
    getHermesConversationByChatId.mockResolvedValue({ chatId: 'chat-1', connectorId: 'conn-1' });
  });

  it("publishes the turn's end on the chat's channel", async () => {
    expect(await (await post({ chatId: 'chat-1', response: 'Done.' })).json()).toEqual({ success: true });
    expect(publishHermesEvent).toHaveBeenCalledWith('chat-1', { kind: 'turn_end', response: 'Done.' });
  });

  it('ignores a chat of another gateway and rejects a malformed event', async () => {
    getHermesConversationByChatId.mockResolvedValueOnce({ chatId: 'chat-1', connectorId: 'conn-other' });
    expect(await (await post({ chatId: 'chat-1', response: null })).json()).toEqual({
      success: false,
      error: 'no_conversation',
    });
    expect((await post({ response: 'Done.' })).status).toBe(400);
    expect(publishHermesEvent).not.toHaveBeenCalled();
  });
});
