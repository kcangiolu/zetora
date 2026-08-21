import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getUser,
  getUserPreferencesByUserId,
  documentsUpdate,
  deleteEpisode,
  createGraphitiMemoryTools,
  createMemoryTools,
  getAnonymizeContext,
  anonymizeToolInput,
  deanonymizeText,
  graphitiAddMemoryExecute,
  supermemoryAddMemoryExecute,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserPreferencesByUserId: vi.fn().mockResolvedValue({ preferences: {} }),
  documentsUpdate: vi.fn().mockResolvedValue({ id: 'doc-1' }),
  deleteEpisode: vi.fn().mockResolvedValue(undefined),
  graphitiAddMemoryExecute: vi.fn().mockResolvedValue({ success: true, result: { id: 'ep-1' } }),
  supermemoryAddMemoryExecute: vi.fn().mockResolvedValue({ success: true, memory: { id: 'doc-1' } }),
  createGraphitiMemoryTools: vi.fn(),
  createMemoryTools: vi.fn(),
  getAnonymizeContext: vi.fn().mockResolvedValue(null),
  anonymizeToolInput: vi.fn(async (value: unknown) => value),
  deanonymizeText: vi.fn(async (text: string) => text),
}));

vi.mock('@/lib/auth-utils', () => ({ getUser }));
vi.mock('@/lib/db/queries', () => ({ getUserPreferencesByUserId }));
vi.mock('@/lib/anonymizer/pseudonymize', () => ({ anonymizeToolInput, deanonymizeText }));
vi.mock('@/ai/providers', () => ({ getAnonymizeContext }));
vi.mock('@/lib/graphiti/client', () => ({ graphitiClient: { deleteEpisode, listEpisodes: vi.fn(), search: vi.fn() } }));
vi.mock('@/lib/tools/graphiti-memory', () => ({ createGraphitiMemoryTools }));
vi.mock('@/lib/tools/supermemory', () => ({ createMemoryTools }));
vi.mock('supermemory', () => ({
  Supermemory: vi.fn().mockImplementation(function SupermemoryMock() {
    return { documents: { update: documentsUpdate, list: vi.fn(), delete: vi.fn() } };
  }),
}));

import { addMemoryManual, updateMemory } from '@/lib/memory-actions';

describe('addMemoryManual / updateMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ id: 'user-1', email: 'u@example.com' });
    getUserPreferencesByUserId.mockResolvedValue({ preferences: {} });
    getAnonymizeContext.mockResolvedValue(null);
    anonymizeToolInput.mockImplementation(async (value: unknown) => value);
    createGraphitiMemoryTools.mockReturnValue({
      addMemoryTool: { execute: graphitiAddMemoryExecute },
      searchMemoryTool: { execute: vi.fn() },
    });
    createMemoryTools.mockReturnValue({
      addMemory: { execute: supermemoryAddMemoryExecute },
      searchMemories: { execute: vi.fn() },
    });
    graphitiAddMemoryExecute.mockResolvedValue({ success: true, result: { id: 'ep-1' } });
    supermemoryAddMemoryExecute.mockResolvedValue({ success: true, memory: { id: 'doc-1' } });
    documentsUpdate.mockResolvedValue({ id: 'doc-1' });
    deleteEpisode.mockResolvedValue(undefined);
  });

  describe('addMemoryManual', () => {
    it('requires authentication', async () => {
      getUser.mockResolvedValue(null);
      await expect(addMemoryManual('hello')).rejects.toThrow('Authentication required');
    });

    it('rejects empty/whitespace content', async () => {
      await expect(addMemoryManual('   ')).rejects.toThrow('Memory content is required');
    });

    it('adds via the graphiti tool factory when that provider is configured', async () => {
      getUserPreferencesByUserId.mockResolvedValue({ preferences: { 'zetora-memory-provider': 'graphiti' } });

      const result = await addMemoryManual('User likes hiking');

      expect(result).toEqual({ success: true });
      expect(createGraphitiMemoryTools).toHaveBeenCalledWith('user-1');
      expect(graphitiAddMemoryExecute).toHaveBeenCalledWith({ memory: 'User likes hiking' }, expect.anything());
      expect(createMemoryTools).not.toHaveBeenCalled();
    });

    it('adds via the supermemory tool factory by default, with anonymization context wired in', async () => {
      getAnonymizeContext.mockResolvedValue({ userId: 'user-1' });

      const result = await addMemoryManual('User works at Acme');

      expect(result).toEqual({ success: true });
      expect(createMemoryTools).toHaveBeenCalledWith('user-1', { userId: 'user-1' });
      expect(supermemoryAddMemoryExecute).toHaveBeenCalledWith({ memory: 'User works at Acme' }, expect.anything());
      expect(createGraphitiMemoryTools).not.toHaveBeenCalled();
    });

    it('surfaces the tool factory error when the add fails', async () => {
      supermemoryAddMemoryExecute.mockResolvedValue({ success: false, error: 'quota exceeded' });
      await expect(addMemoryManual('anything')).rejects.toThrow('quota exceeded');
    });
  });

  describe('updateMemory', () => {
    it('for graphiti, deletes the old episode then adds a fresh one', async () => {
      getUserPreferencesByUserId.mockResolvedValue({ preferences: { 'zetora-memory-provider': 'graphiti' } });

      const result = await updateMemory('ep-old', 'User likes climbing now');

      expect(deleteEpisode).toHaveBeenCalledWith('ep-old', 'user-1');
      expect(graphitiAddMemoryExecute).toHaveBeenCalledWith({ memory: 'User likes climbing now' }, expect.anything());
      expect(result).toEqual({ success: true });
    });

    it('propagates a graphiti delete failure without adding a new episode', async () => {
      getUserPreferencesByUserId.mockResolvedValue({ preferences: { 'zetora-memory-provider': 'graphiti' } });
      deleteEpisode.mockRejectedValue(new Error('graphiti down'));

      await expect(updateMemory('ep-old', 'new text')).rejects.toThrow('graphiti down');
      expect(graphitiAddMemoryExecute).not.toHaveBeenCalled();
    });

    it('for supermemory, PATCHes the document content directly by default', async () => {
      const result = await updateMemory('doc-1', 'User works at Acme now');

      expect(documentsUpdate).toHaveBeenCalledWith('doc-1', { content: 'User works at Acme now' });
      expect(result).toEqual({ success: true });
    });

    it('for supermemory, anonymizes the new content before PATCHing when anonymization is enabled', async () => {
      getAnonymizeContext.mockResolvedValue({ userId: 'user-1' });
      anonymizeToolInput.mockResolvedValue({ memory: 'masked-content' });

      await updateMemory('doc-1', 'User works at Acme now');

      expect(anonymizeToolInput).toHaveBeenCalledWith({ memory: 'User works at Acme now' }, { userId: 'user-1' });
      expect(documentsUpdate).toHaveBeenCalledWith('doc-1', { content: 'masked-content' });
    });
  });
});
