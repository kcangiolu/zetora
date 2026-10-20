import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getMessageById,
  startHermesToolStep,
  finishHermesToolStep,
  publishHermesEvent,
} = vi.hoisted(() => ({
  getHermesConnectorByGatewayId: vi.fn(),
  getHermesConversationByChatId: vi.fn(),
  getMessageById: vi.fn(),
  startHermesToolStep: vi.fn(),
  finishHermesToolStep: vi.fn(),
  publishHermesEvent: vi.fn(),
}));

vi.mock('@/lib/hermes/internal-auth', () => ({ assertInternalHermesAuth: () => null }));
vi.mock('@/lib/hermes/feature-flag', () => ({ assertHermesEnabled: () => null }));
vi.mock('@/lib/db/queries', () => ({
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getMessageById,
  startHermesToolStep,
  finishHermesToolStep,
}));
vi.mock('@/lib/hermes/realtime', () => ({ publishHermesEvent }));

import { POST } from '@/app/api/internal/hermes/tool-event/route';
import { parseHermesToolEvent } from '@/lib/hermes/tool-steps';

const CHAT_ID = 'chat-1';

const started = {
  phase: 'started',
  chatId: CHAT_ID,
  toolCallId: 'toolu_1',
  toolName: 'terminal',
  preview: 'date',
  triggerMessageId: 'msg-user',
};

const finished = { phase: 'finished', chatId: CHAT_ID, toolCallId: 'toolu_1', status: 'ok', durationMs: 412 };

const stepRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'step-1',
  chatId: CHAT_ID,
  toolCallId: 'toolu_1',
  triggerMessageId: 'msg-user',
  toolName: 'terminal',
  preview: 'date',
  status: 'running',
  durationMs: null,
  startedAt: new Date('2026-10-20T10:00:00Z'),
  ...overrides,
});

const post = (event: unknown, gatewayId = 'gw-test') =>
  POST(
    new Request('http://localhost/api/internal/hermes/tool-event', {
      method: 'POST',
      body: JSON.stringify({ gatewayId, event }),
    }) as never,
  );

describe('parseHermesToolEvent', () => {
  it('accepts the start and finish events the plugin sends', () => {
    expect(parseHermesToolEvent(started)).toEqual(started);
    expect(parseHermesToolEvent(finished)).toEqual(finished);
  });

  it('accepts a start with no preview and no known trigger', () => {
    expect(parseHermesToolEvent({ ...started, preview: null, triggerMessageId: null })).toMatchObject({
      preview: null,
      triggerMessageId: null,
    });
  });

  it('rejects a finish whose status is not one Hermes reports', () => {
    expect(parseHermesToolEvent({ ...finished, status: 'running' })).toBeNull();
    expect(parseHermesToolEvent({ ...finished, status: undefined })).toBeNull();
  });

  it('rejects malformed or oversized fields', () => {
    expect(parseHermesToolEvent({ ...started, toolName: '' })).toBeNull();
    expect(parseHermesToolEvent({ ...started, preview: 'x'.repeat(301) })).toBeNull();
    expect(parseHermesToolEvent({ ...finished, durationMs: -1 })).toBeNull();
    expect(parseHermesToolEvent({ ...finished, durationMs: 1.5 })).toBeNull();
    expect(parseHermesToolEvent({ ...started, phase: 'progress' })).toBeNull();
    expect(parseHermesToolEvent('started')).toBeNull();
  });
});

describe('POST /api/internal/hermes/tool-event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHermesConnectorByGatewayId.mockResolvedValue({ id: 'connector-1', userId: 'user-1', gatewayId: 'gw-test' });
    getHermesConversationByChatId.mockResolvedValue({ chatId: CHAT_ID, connectorId: 'connector-1' });
    getMessageById.mockResolvedValue([{ id: 'msg-user', chatId: CHAT_ID, role: 'user' }]);
    startHermesToolStep.mockResolvedValue(stepRow());
    finishHermesToolStep.mockResolvedValue(stepRow({ status: 'ok', durationMs: 412 }));
    publishHermesEvent.mockResolvedValue(undefined);
  });

  it('records a started step tied to its turn and pushes it live', async () => {
    const res = await post(started);
    expect(await res.json()).toEqual({ success: true });
    expect(startHermesToolStep).toHaveBeenCalledWith({
      chatId: CHAT_ID,
      toolCallId: 'toolu_1',
      triggerMessageId: 'msg-user',
      toolName: 'terminal',
      preview: 'date',
    });
    expect(publishHermesEvent).toHaveBeenCalledWith(CHAT_ID, {
      kind: 'tool_step',
      step: expect.objectContaining({
        toolCallId: 'toolu_1',
        status: 'running',
        startedAt: '2026-10-20T10:00:00.000Z',
      }),
    });
  });

  it('does not tie a step to a message that is not a user message of this chat', async () => {
    getMessageById.mockResolvedValue([{ id: 'msg-user', chatId: 'other-chat', role: 'user' }]);
    await post(started);
    expect(startHermesToolStep).toHaveBeenCalledWith(expect.objectContaining({ triggerMessageId: null }));
  });

  it('records the outcome of a finished step', async () => {
    const res = await post(finished);
    expect(await res.json()).toEqual({ success: true });
    expect(finishHermesToolStep).toHaveBeenCalledWith(finished);
    expect(publishHermesEvent).toHaveBeenCalledWith(CHAT_ID, {
      kind: 'tool_step',
      step: expect.objectContaining({ status: 'ok', durationMs: 412 }),
    });
  });

  it('reports a finish for a step that never started without publishing', async () => {
    finishHermesToolStep.mockResolvedValue(null);
    expect(await (await post(finished)).json()).toEqual({ success: false, error: 'unknown_step' });
    expect(publishHermesEvent).not.toHaveBeenCalled();
  });

  it("refuses a chat that belongs to another user's gateway", async () => {
    getHermesConversationByChatId.mockResolvedValue({ chatId: CHAT_ID, connectorId: 'other-connector' });
    expect(await (await post(started)).json()).toEqual({ success: false, error: 'no_conversation' });
    expect(startHermesToolStep).not.toHaveBeenCalled();
  });

  it('refuses an unknown gateway', async () => {
    getHermesConnectorByGatewayId.mockResolvedValue(null);
    expect(await (await post(started)).json()).toEqual({ success: false, error: 'unknown_gateway' });
  });

  it('rejects an invalid event with a 400', async () => {
    const res = await post({ ...finished, status: 'weird' });
    expect(res.status).toBe(400);
    expect(startHermesToolStep).not.toHaveBeenCalled();
    expect(finishHermesToolStep).not.toHaveBeenCalled();
  });
});
