import { describe, it, expect, vi } from 'vitest';

const { search, addEpisode, getUserById } = vi.hoisted(() => ({
  search: vi.fn(),
  addEpisode: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('@/lib/graphiti/client', () => ({
  graphitiClient: { search, addEpisode },
}));

vi.mock('@/lib/db/queries/users', () => ({
  getUserById,
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
    getUserById.mockResolvedValue(null);
    const { addMemoryTool } = createGraphitiMemoryTools('user-1');

    const result = await (addMemoryTool.execute as any)({ memory: 'likes hiking' }, {} as any);

    // The write is fire-and-forget (see graphiti-memory.ts) so execute()
    // resolves before addEpisode is actually called — wait for it here.
    expect(result).toEqual({ success: true, queued: true, note: expect.any(String) });
    await vi.waitFor(() =>
      expect(addEpisode).toHaveBeenCalledWith(
        expect.objectContaining({ episodeBody: 'likes hiking', groupId: 'user-1' }),
      ),
    );
  });

  it('anchors the memory to the user\'s real name so a pronoun-only fact has a subject to attach to', async () => {
    addEpisode.mockResolvedValue({ id: 'ep-1' });
    getUserById.mockResolvedValue({ name: 'Kenny' });
    const { addMemoryTool } = createGraphitiMemoryTools('user-1');

    await (addMemoryTool.execute as any)({ memory: "J'adore la mangue" }, {} as any);

    await vi.waitFor(() =>
      expect(addEpisode).toHaveBeenCalledWith(
        expect.objectContaining({ episodeBody: "Kenny: J'adore la mangue", groupId: 'user-1' }),
      ),
    );
  });
});
