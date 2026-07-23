import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  generateText,
  resolveTertiaryModel,
  getTertiaryModelConfig,
  getAnonymizeContext,
  createGraphitiMemoryTools,
  createMemoryTools,
} = vi.hoisted(() => ({
  generateText: vi.fn().mockResolvedValue({ text: '' }),
  resolveTertiaryModel: vi.fn().mockResolvedValue('mock-model'),
  getTertiaryModelConfig: vi.fn().mockReturnValue({ model: 'zetora-default', provider: 'zetora', isCustom: false }),
  getAnonymizeContext: vi.fn().mockResolvedValue(null),
  createGraphitiMemoryTools: vi.fn().mockReturnValue({
    searchMemoryTool: { name: 'graphiti-search' },
    addMemoryTool: { name: 'graphiti-add' },
  }),
  createMemoryTools: vi.fn().mockReturnValue({
    searchMemories: { name: 'supermemory-search' },
    addMemory: { name: 'supermemory-add' },
  }),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText };
});
vi.mock('@/ai/tertiary', () => ({ resolveTertiaryModel, getTertiaryModelConfig }));
vi.mock('@/ai/providers', () => ({ getAnonymizeContext }));
vi.mock('@/lib/tools/graphiti-memory', () => ({ createGraphitiMemoryTools }));
vi.mock('@/lib/tools/supermemory', () => ({ createMemoryTools }));

import { runMemoryCurator } from '@/lib/search/memory-curator';

function makeMessage(id: string, role: 'user' | 'assistant', text: string) {
  return { id, role, parts: [{ type: 'text', text }] } as any;
}

describe('runMemoryCurator', () => {
  beforeEach(() => {
    generateText.mockClear();
    resolveTertiaryModel.mockClear();
    getTertiaryModelConfig.mockClear();
    getAnonymizeContext.mockClear();
    createGraphitiMemoryTools.mockClear();
    createMemoryTools.mockClear();
  });

  it('does nothing when the curator preference is explicitly disabled', async () => {
    runMemoryCurator({
      messages: [makeMessage('m1', 'user', 'hello')],
      userQueryText: 'hello',
      userId: 'user-1',
      preferences: { 'zetora-memory-curator-enabled': false },
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(generateText).not.toHaveBeenCalled();
  });

  it('skips the LLM call when the turn has no extractable text', async () => {
    runMemoryCurator({
      messages: [{ id: 'm1', role: 'user', parts: [] } as any],
      userQueryText: '',
      userId: 'user-1',
      preferences: {},
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(generateText).not.toHaveBeenCalled();
  });

  it('is a no-op when every message id was already curated (resumed stream)', async () => {
    const messages = [makeMessage('dup-1', 'user', 'remember I like hiking')];
    runMemoryCurator({ messages, userQueryText: 'remember I like hiking', userId: 'user-1', preferences: {} });
    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));

    generateText.mockClear();
    runMemoryCurator({ messages, userQueryText: 'remember I like hiking', userId: 'user-1', preferences: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(generateText).not.toHaveBeenCalled();
  });

  it('dispatches to the graphiti tool factory and exposes snake_case tool names', async () => {
    runMemoryCurator({
      messages: [makeMessage('g1', 'user', 'remember I work at Acme')],
      userQueryText: 'remember I work at Acme',
      userId: 'user-1',
      preferences: { 'zetora-memory-provider': 'graphiti' },
    });

    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));
    expect(createGraphitiMemoryTools).toHaveBeenCalledWith('user-1');
    expect(createMemoryTools).not.toHaveBeenCalled();
    const call = generateText.mock.calls[0][0];
    expect(Object.keys(call.tools)).toEqual(['search_memories', 'add_memory']);
    expect(call.tools.search_memories).toEqual({ name: 'graphiti-search' });
    expect(call.tools.add_memory).toEqual({ name: 'graphiti-add' });
  });

  it('dispatches to the supermemory tool factory by default and exposes snake_case tool names', async () => {
    runMemoryCurator({
      messages: [makeMessage('s1', 'user', 'remember I work at Acme')],
      userQueryText: 'remember I work at Acme',
      userId: 'user-1',
      preferences: {},
    });

    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));
    expect(createMemoryTools).toHaveBeenCalledWith('user-1', null);
    expect(createGraphitiMemoryTools).not.toHaveBeenCalled();
    const call = generateText.mock.calls[0][0];
    expect(Object.keys(call.tools)).toEqual(['search_memories', 'add_memory']);
    expect(call.tools.search_memories).toEqual({ name: 'supermemory-search' });
    expect(call.tools.add_memory).toEqual({ name: 'supermemory-add' });
  });

  it('swallows a rejected generateText call instead of throwing', async () => {
    generateText.mockRejectedValueOnce(new Error('model down'));

    expect(() =>
      runMemoryCurator({
        messages: [makeMessage('e1', 'user', 'remember I work at Acme')],
        userQueryText: 'remember I work at Acme',
        userId: 'user-1',
        preferences: {},
      }),
    ).not.toThrow();

    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));
  });
});
