'use server';

import { getUser } from '@/lib/auth-utils';
import { serverEnv } from '@/env/server';
import { Supermemory } from 'supermemory';
import { graphitiClient } from '@/lib/graphiti/client';
import { getUserPreferencesByUserId } from '@/lib/db/queries';
import { deanonymizeText, anonymizeToolInput } from '@/lib/anonymizer/pseudonymize';
import { getAnonymizeContext } from '@/ai/providers';
import { createGraphitiMemoryTools } from '@/lib/tools/graphiti-memory';
import { createMemoryTools } from '@/lib/tools/supermemory';

import { createLogger } from '@/lib/logger';

const log = createLogger('memory-actions');

const supermemoryClient = new Supermemory({
  apiKey: serverEnv.SUPERMEMORY_API_KEY,
});

export interface MemoryItem {
  id: string;
  customId: string;
  connectionId: string | null;
  containerTags: string[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  status: string;
  summary: string;
  title: string;
  type: string;
  content: string;
  name?: string;
  memory?: string;
  user_id?: string;
  owner?: string;
  immutable?: boolean;
  expiration_date?: string | null;
  created_at?: string;
  categories?: string[];
}

export interface MemoryResponse {
  memories: MemoryItem[];
  total: number;
}

async function getPreferences(userId: string): Promise<Record<string, unknown>> {
  try {
    const prefs = await getUserPreferencesByUserId({ userId });
    return (prefs?.preferences ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function getMemoryProvider(userId: string): Promise<'supermemory' | 'graphiti'> {
  const preferences = await getPreferences(userId);
  return (preferences['zetora-memory-provider'] as 'supermemory' | 'graphiti') || 'supermemory';
}

// SuperMemory content can hold anonymization tokens (see lib/tools/supermemory.ts) —
// de-anonymize before it ever reaches the user-facing memory management UI.
// A no-op for content with no tokens, so it's safe to always run.
async function deanonymizeMemoryItem(item: MemoryItem, userId: string): Promise<MemoryItem> {
  const [content, summary, title, memory] = await Promise.all([
    deanonymizeText(item.content, { userId }),
    deanonymizeText(item.summary, { userId }),
    deanonymizeText(item.title, { userId }),
    item.memory ? deanonymizeText(item.memory, { userId }) : Promise.resolve(item.memory),
  ]);
  return { ...item, content, summary, title, memory };
}

function graphitiEpisodeToMemoryItem(episode: any, index: number): MemoryItem {
  const now = new Date().toISOString();
  const content =
    typeof episode === 'string'
      ? episode
      : episode.content || episode.episode_body || episode.summary || JSON.stringify(episode);

  const title =
    typeof episode === 'string' ? content.slice(0, 100) : episode.name || episode.title || content.slice(0, 100);

  return {
    id: episode.uuid || episode.id || `graphiti-${index}`,
    customId: episode.uuid || episode.id || `graphiti-${index}`,
    connectionId: null,
    containerTags: [],
    createdAt: episode.created_at || episode.valid_at || now,
    updatedAt: episode.updated_at || now,
    metadata: {},
    status: 'active',
    summary: content.slice(0, 200),
    title,
    type: 'graphiti-episode',
    content,
  };
}

export async function getAllMemories(page = 1, pageSize = 20): Promise<MemoryResponse> {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');

  const provider = await getMemoryProvider(user.id);

  if (provider === 'graphiti') {
    try {
      const client = graphitiClient;
      const result = await client.listEpisodes(user.id, pageSize, (page - 1) * pageSize);
      const episodes = result.episodes || [];
      const memories = episodes.map((ep: any, i: number) => graphitiEpisodeToMemoryItem(ep, i));
      return { memories, total: result.total || memories.length };
    } catch (error) {
      log.error('Error fetching Graphiti memories:', error);
      return { memories: [], total: 0 };
    }
  }

  // SuperMemory
  try {
    const result = await supermemoryClient.documents.list({
      containerTags: [user.id],
      page,
      limit: pageSize,
      includeContent: true,
    });
    const memories = await Promise.all(
      (result.memories as MemoryItem[]).map((item) => deanonymizeMemoryItem(item, user.id)),
    );
    return {
      memories,
      total: result.pagination.totalItems || 0,
    };
  } catch (error) {
    log.error('Error fetching memories:', error);
    throw error;
  }
}

export async function deleteMemory(memoryId: string) {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');

  const provider = await getMemoryProvider(user.id);

  if (provider === 'graphiti') {
    try {
      const client = graphitiClient;
      await client.deleteEpisode(memoryId);
      return { success: true };
    } catch (error) {
      log.error('Error deleting Graphiti memory:', error);
      throw error;
    }
  }

  // SuperMemory — existing behavior unchanged
  try {
    const data = await supermemoryClient.documents.delete(memoryId);
    return data;
  } catch (error) {
    log.error('Error deleting memory:', error);
    throw error;
  }
}

// Manual add from the Memories settings tab — reuses the exact same
// add_memory tool factories the chat LLM and the background curator use, so
// SuperMemory anonymization wrapping stays in one place.
export async function addMemoryManual(content: string): Promise<{ success: boolean }> {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');

  const memory = content.trim();
  if (!memory) throw new Error('Memory content is required');

  const provider = await getMemoryProvider(user.id);

  if (provider === 'graphiti') {
    const { addMemoryTool } = createGraphitiMemoryTools(user.id);
    const result = (await addMemoryTool.execute!({ memory }, {} as never)) as {
      success: boolean;
      error?: string;
    };
    if (!result.success) throw new Error(result.error ?? 'Failed to add memory');
    return { success: true };
  }

  const preferences = await getPreferences(user.id);
  const anonymizeContext = await getAnonymizeContext('zetora-manual', preferences, user.id);
  const { addMemory } = createMemoryTools(user.id, anonymizeContext);
  const result = (await addMemory.execute!({ memory }, {} as never)) as { success: boolean; error?: string };
  if (!result.success) throw new Error(result.error ?? 'Failed to add memory');
  return { success: true };
}

// Edits an existing memory. SuperMemory supports a real in-place PATCH.
// Graphiti has no update endpoint — graphiti_core.remove_episode() does a
// real cascade cleanup of the edges/nodes solely derived from that episode
// (see /episodes/{uuid} DELETE), so an edit there is a clean delete followed
// by a fresh add, not a raw text swap.
export async function updateMemory(memoryId: string, content: string): Promise<{ success: boolean }> {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');

  const memory = content.trim();
  if (!memory) throw new Error('Memory content is required');

  const provider = await getMemoryProvider(user.id);

  if (provider === 'graphiti') {
    try {
      await graphitiClient.deleteEpisode(memoryId);
      const { addMemoryTool } = createGraphitiMemoryTools(user.id);
      const result = (await addMemoryTool.execute!({ memory }, {} as never)) as {
        success: boolean;
        error?: string;
      };
      if (!result.success) throw new Error(result.error ?? 'Failed to update memory');
      return { success: true };
    } catch (error) {
      log.error('Error updating Graphiti memory:', error);
      throw error;
    }
  }

  try {
    const preferences = await getPreferences(user.id);
    const anonymizeContext = await getAnonymizeContext('zetora-manual', preferences, user.id);
    const masked = anonymizeContext
      ? ((await anonymizeToolInput({ memory }, anonymizeContext)) as { memory: string }).memory
      : memory;
    await supermemoryClient.documents.update(memoryId, { content: masked });
    return { success: true };
  } catch (error) {
    log.error('Error updating memory:', error);
    throw error;
  }
}
