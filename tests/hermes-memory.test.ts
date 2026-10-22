import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getUserPreferencesByUserId,
  listMemoryEntries,
  rememberMemoryEntry,
  loadMemoryContext,
  applyMemoryOps,
  buildStandaloneTurnPrompt,
  runDedicatedMemoryTurnUpdate,
} = vi.hoisted(() => ({
  getHermesConnectorByGatewayId: vi.fn(),
  getHermesConversationByChatId: vi.fn(),
  getUserPreferencesByUserId: vi.fn(),
  listMemoryEntries: vi.fn(),
  rememberMemoryEntry: vi.fn(),
  loadMemoryContext: vi.fn(),
  applyMemoryOps: vi.fn(),
  buildStandaloneTurnPrompt: vi.fn(),
  runDedicatedMemoryTurnUpdate: vi.fn(),
}));

vi.mock('@/lib/hermes/internal-auth', () => ({ assertInternalHermesAuth: () => null }));
vi.mock('@/lib/hermes/feature-flag', () => ({ assertHermesEnabled: () => null }));
vi.mock('@/lib/db/queries', () => ({
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getUserPreferencesByUserId,
  listMemoryEntries,
  rememberMemoryEntry,
}));
vi.mock('@/lib/memory/context', () => ({ loadMemoryContext }));
vi.mock('@/lib/memory/jobs', () => ({ applyMemoryOps, buildStandaloneTurnPrompt, runDedicatedMemoryTurnUpdate }));

import { POST } from '@/app/api/internal/hermes/memory/route';
import { parseMemoryOpsOutput } from '@/lib/hermes/memory';

const OPS = {
  ops: [{ op: 'confirm', id: 'e1', text: null, category: null, durability: null, tier: null, keywords: null }],
};

const post = (request: unknown, gatewayId = 'gw-test') =>
  POST(
    new Request('http://localhost/api/internal/hermes/memory', {
      method: 'POST',
      body: JSON.stringify({ gatewayId, request }),
    }) as never,
  );

describe('parseMemoryOpsOutput', () => {
  it('reads a bare JSON reply', () => {
    expect(parseMemoryOpsOutput(JSON.stringify(OPS))).toEqual(OPS.ops);
  });

  it('reads JSON wrapped in a code fence and text', () => {
    expect(parseMemoryOpsOutput(`Here it is:\n\`\`\`json\n${JSON.stringify(OPS)}\n\`\`\``)).toEqual(OPS.ops);
  });

  it('rejects a reply with no JSON, broken JSON or the wrong shape', () => {
    expect(parseMemoryOpsOutput('Nothing to remember.')).toBeNull();
    expect(parseMemoryOpsOutput('{"ops": [')).toBeNull();
    expect(parseMemoryOpsOutput('{"ops": [{"op": "forget"}]}')).toBeNull();
  });
});

describe('POST /api/internal/hermes/memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHermesConnectorByGatewayId.mockResolvedValue({ id: 'conn-1', userId: 'user-1', status: 'enrolled' });
    getHermesConversationByChatId.mockResolvedValue({ chatId: 'chat-1', connectorId: 'conn-1' });
    getUserPreferencesByUserId.mockResolvedValue({ preferences: {} });
    buildStandaloneTurnPrompt.mockResolvedValue('<conversation>…</conversation>');
    runDedicatedMemoryTurnUpdate.mockResolvedValue(undefined);
    applyMemoryOps.mockResolvedValue([{ kind: 'confirm', id: 'e1' }]);
  });

  const turn = { action: 'turn', chatId: 'chat-1', sessionId: 's-1', user: 'I moved to Lyon', assistant: 'Noted.' };

  it('rejects a revoked gateway and a malformed request', async () => {
    getHermesConnectorByGatewayId.mockResolvedValueOnce({ id: 'conn-1', userId: 'user-1', status: 'revoked' });
    expect((await post({ action: 'context' })).status).toBe(404);
    expect((await post({ action: 'forget' })).status).toBe(400);
  });

  it('answers nothing but "disabled" when memory is turned off', async () => {
    getUserPreferencesByUserId.mockResolvedValue({ preferences: { 'zetora-memory-enabled': false } });
    expect(await (await post(turn)).json()).toEqual({ enabled: false });
    expect(buildStandaloneTurnPrompt).not.toHaveBeenCalled();
  });

  it("hands the update to Hermes's model when no Memory model is picked", async () => {
    const body = await (await post(turn)).json();
    expect(body.mode).toBe('agent');
    expect(body.prompt).toContain('<conversation>');
    expect(body.prompt).toContain('JSON Schema');
    expect(runDedicatedMemoryTurnUpdate).not.toHaveBeenCalled();
  });

  it('runs the update itself on the picked Memory model', async () => {
    getUserPreferencesByUserId.mockResolvedValue({
      preferences: { 'zetora-tertiary-memory-curator-model': 'some-model' },
    });
    expect((await (await post(turn)).json()).mode).toBe('zetora');
    expect(runDedicatedMemoryTurnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', origin: { chatId: 'chat-1', sessionId: 's-1' } }),
    );
  });

  it('applies valid operations, keeping the chat only when it is one of this gateway', async () => {
    const ops = { action: 'ops', chatId: 'chat-1', sessionId: 's-1', output: JSON.stringify(OPS) };
    expect(await (await post(ops)).json()).toEqual({ enabled: true, applied: ['confirm'] });
    expect(applyMemoryOps).toHaveBeenCalledWith('user-1', { chatId: 'chat-1', sessionId: 's-1' }, OPS.ops);

    getHermesConversationByChatId.mockResolvedValueOnce({ chatId: 'chat-1', connectorId: 'conn-other' });
    await post(ops);
    expect(applyMemoryOps).toHaveBeenLastCalledWith('user-1', { chatId: null, sessionId: 's-1' }, OPS.ops);
  });

  it('applies nothing from a reply without valid operations', async () => {
    const body = await (await post({ action: 'ops', chatId: null, sessionId: 's-1', output: 'No changes.' })).json();
    expect(body).toEqual({ enabled: true, applied: [], error: 'invalid_output' });
    expect(applyMemoryOps).not.toHaveBeenCalled();
  });
});
