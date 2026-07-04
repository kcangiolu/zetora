'use server';

import { getUser } from '@/lib/auth-utils';
import { serverEnv } from '@/env/server';
import { Supermemory } from 'supermemory';
import { graphitiClient, createGraphitiClient } from '@/lib/graphiti/client';
import { getUserPreferencesByUserId } from '@/lib/db/queries';

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

async function getMemoryProvider(userId: string): Promise<'supermemory' | 'graphiti'> {
  try {
    const prefs = await getUserPreferencesByUserId({ userId });
    return (prefs?.preferences?.['zetora-memory-provider'] as 'supermemory' | 'graphiti') || 'supermemory';
  } catch {
    return 'supermemory';
  }
}

async function getGraphitiClientForUser(userId: string) {
  try {
    const prefs = await getUserPreferencesByUserId({ userId });
    const apiUrl = prefs?.preferences?.['zetora-graphiti-api-url'];
    return typeof apiUrl === 'string' && apiUrl ? createGraphitiClient(apiUrl) : graphitiClient;
  } catch {
    return graphitiClient;
  }
}

function graphitiEpisodeToMemoryItem(episode: any, index: number): MemoryItem {
  const now = new Date().toISOString();
  const content = typeof episode === 'string'
    ? episode
    : episode.content || episode.episode_body || episode.summary || JSON.stringify(episode);

  const title = typeof episode === 'string'
    ? content.slice(0, 100)
    : episode.name || episode.title || content.slice(0, 100);

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

export async function searchMemories(
  query: string,
  page = 1,
  pageSize = 20,
): Promise<MemoryResponse> {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');
  if (!query.trim()) return { memories: [], total: 0 };

  const provider = await getMemoryProvider(user.id);

  if (provider === 'graphiti') {
    try {
      const client = await getGraphitiClientForUser(user.id);
      const result = await client.search(query, user.id, pageSize);
      const episodes = result.results || [];
      const memories = episodes.map((ep: any, i: number) =>
        graphitiEpisodeToMemoryItem(ep, i),
      );
      return { memories, total: memories.length };
    } catch (error) {
      console.error('Error searching Graphiti memories:', error);
      return { memories: [], total: 0 };
    }
  }

  // SuperMemory — existing behavior unchanged
  try {
    const result = await supermemoryClient.search.memories({
      q: query,
      containerTag: user.id,
      limit: pageSize,
    });
    return { memories: [], total: result.total || 0 };
  } catch (error) {
    console.error('Error searching memories:', error);
    throw error;
  }
}

export async function getAllMemories(
  page = 1,
  pageSize = 20,
): Promise<MemoryResponse> {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');

  const provider = await getMemoryProvider(user.id);

  if (provider === 'graphiti') {
    try {
      const client = await getGraphitiClientForUser(user.id);
      const result = await client.listEpisodes(user.id, pageSize, (page - 1) * pageSize);
      const episodes = result.episodes || [];
      const memories = episodes.map((ep: any, i: number) =>
        graphitiEpisodeToMemoryItem(ep, i),
      );
      return { memories, total: result.total || memories.length };
    } catch (error) {
      console.error('Error fetching Graphiti memories:', error);
      return { memories: [], total: 0 };
    }
  }

  // SuperMemory — existing behavior unchanged
  try {
    const result = await supermemoryClient.documents.list({
      containerTags: [user.id],
      page,
      limit: pageSize,
      includeContent: true,
    });
    return {
      memories: result.memories as any,
      total: result.pagination.totalItems || 0,
    };
  } catch (error) {
    console.error('Error fetching memories:', error);
    throw error;
  }
}

export async function deleteMemory(memoryId: string) {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');

  const provider = await getMemoryProvider(user.id);

  if (provider === 'graphiti') {
    try {
      const client = await getGraphitiClientForUser(user.id);
      await client.deleteEpisode(memoryId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting Graphiti memory:', error);
      throw error;
    }
  }

  // SuperMemory — existing behavior unchanged
  try {
    const data = await supermemoryClient.documents.delete(memoryId);
    return data;
  } catch (error) {
    console.error('Error deleting memory:', error);
    throw error;
  }
}
