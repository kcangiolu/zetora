import { describe, it, expect, vi } from 'vitest';

const { search, addEpisode } = vi.hoisted(() => ({
  search: vi.fn(),
  addEpisode: vi.fn(),
}));

vi.mock('@/lib/graphiti/client', () => ({
  graphitiClient: { search, addEpisode },
}));

import { createGraphitiMemoryTools } from '@/lib/tools/graphiti-memory';

describe('createGraphitiMemoryTools', () => {
  it('caps memory search at 5 results and never lets an empty threshold leak everything', async () => {
    search.mockResolvedValue({ results: [] });
    const { searchMemoryTool } = createGraphitiMemoryTools('user-1');

    await (searchMemoryTool.execute as any)({ informationToGet: 'Tesla' }, {} as any);

    expect(search).toHaveBeenCalledWith('Tesla', 'user-1', 5);
  });

  it('frames search results as past, possibly-unrelated context', async () => {
    search.mockResolvedValue({ results: [{ fact: 'likes Tesla cars' }] });
    const { searchMemoryTool } = createGraphitiMemoryTools('user-1');

    const result: any = await (searchMemoryTool.execute as any)({ informationToGet: 'Tesla' }, {} as any);

    expect(result.success).toBe(true);
    expect(result.note).toMatch(/PAST conversations/);
    expect(result.note).toMatch(/NEVER let them change the topic/);
    expect(result.count).toBe(1);
  });

  it('reports failure without throwing when the client errors', async () => {
    search.mockRejectedValue(new Error('graphiti down'));
    const { searchMemoryTool } = createGraphitiMemoryTools('user-1');

    const result = await (searchMemoryTool.execute as any)({ informationToGet: 'anything' }, {} as any);

    expect(result).toEqual({ success: false, error: 'graphiti down' });
  });

  it('scopes add_memory to the given userId as groupId', async () => {
    addEpisode.mockResolvedValue({ id: 'ep-1' });
    const { addMemoryTool } = createGraphitiMemoryTools('user-1');

    await (addMemoryTool.execute as any)({ memory: 'likes hiking' }, {} as any);

    expect(addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ episodeBody: 'likes hiking', groupId: 'user-1' }),
    );
  });
});
