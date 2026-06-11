import { serverEnv } from '@/env/server';

export interface GraphitiEpisode {
  name: string;
  episodeBody: string;
  referenceTime?: string;
  sourceDescription?: string;
  groupId?: string;
}

export interface GraphitiSearchResult {
  success: boolean;
  results: any[];
}

export interface GraphitiEpisodeResult {
  success: boolean;
  result: any;
}

class GraphitiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || serverEnv.GRAPHITI_API_URL || 'http://localhost:8000';
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async addEpisode(input: GraphitiEpisode): Promise<GraphitiEpisodeResult> {
    const res = await fetch(`${this.baseUrl}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        episode_body: input.episodeBody,
        reference_time: input.referenceTime,
        source_description: input.sourceDescription || 'Zetora conversation',
        group_id: input.groupId,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.detail || parsed.message || parsed.error || errorText;
      } catch {
        // Le body n'est pas du JSON valide, utiliser le texte brut
        errorMessage = errorText || `HTTP ${res.status} (empty body)`;
      }
      throw new Error(`Graphiti add_episode failed: ${errorMessage}`);
    }

    return res.json();
  }

  async search(
    query: string,
    groupId?: string,
    numResults: number = 10,
  ): Promise<GraphitiSearchResult> {
    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        group_id: groupId,
        num_results: numResults,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.detail || parsed.message || parsed.error || errorText;
      } catch {
        // Le body n'est pas du JSON valide, utiliser le texte brut
        errorMessage = errorText || `HTTP ${res.status} (empty body)`;
      }
      throw new Error(`Graphiti search failed: ${errorMessage}`);
    }

    return res.json();
  }

  async deleteGroup(groupId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/episodes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Graphiti delete_group failed: ${error}`);
    }
  }

  async listEpisodes(
    groupId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ success: boolean; episodes: any[]; total: number }> {
    const params = new URLSearchParams({
      group_id: groupId,
      limit: String(limit),
      offset: String(offset),
    });

    const res = await fetch(`${this.baseUrl}/episodes?${params}`);

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Graphiti list_episodes failed: ${error}`);
    }

    return res.json();
  }

  async configure(llmModel?: string, llmApiKey?: string, llmBaseUrl?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm_model: llmModel ?? null,
        llm_api_key: llmApiKey ?? null,
        llm_base_url: llmBaseUrl ?? null,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Graphiti configure failed: ${error}`);
    }
  }

  async deleteEpisode(episodeUuid: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/episodes/${episodeUuid}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Graphiti delete_episode failed: ${error}`);
    }
  }
}

export const graphitiClient = new GraphitiClient();

export function createGraphitiClient(baseUrl: string): GraphitiClient {
  return new GraphitiClient(baseUrl);
}
