import { tool } from 'ai';
import { z } from 'zod';
import { UIMessageStreamWriter } from 'ai';
import { ChatMessage } from '@/lib/types';

import Firecrawl from '@mendable/firecrawl-js';
import { serverEnv } from '@/env/server';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

import { createLogger } from '@/lib/logger';
import { FASTCRW_SEARCH_TIMEOUT_MS, GITHUB_API_TIMEOUT_MS, SEARXNG_TIMEOUT_MS, withAbort } from '@/lib/timeouts';

const log = createLogger('github-search');

const firecrawl = new Firecrawl({ apiKey: serverEnv.FIRECRAWL_API_KEY });

function getGitHubResultUrl(result: unknown): string {
  const r = result as any;
  return r?.url || r?.metadata?.url || r?.metadata?.ogUrl || r?.metadata?.sourceURL || '';
}

function isGitHubRepoUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname !== 'github.com') return false;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return false; // profiles like /owner

    const [first, second] = parts;
    const nonRepoFirstSegments = new Set([
      'about',
      'account',
      'collections',
      'contact',
      'customer-stories',
      'enterprise',
      'events',
      'explore',
      'features',
      'issues',
      'login',
      'marketplace',
      'new',
      'notifications',
      'orgs',
      'pricing',
      'pulls',
      'search',
      'security',
      'settings',
      'sponsors',
      'stars',
      'topics',
      'trending',
    ]);

    if (nonRepoFirstSegments.has(first.toLowerCase())) return false; // e.g. /topics/...
    if (second.toLowerCase() === 'followers' || second.toLowerCase() === 'following') return false;

    return true;
  } catch {
    // Non-absolute URL or invalid URL
    return false;
  }
}

interface GithubRepoApiResponse {
  description: string | null;
  stargazers_count: number;
  language: string | null;
  pushed_at: string | null;
  updated_at: string | null;
  owner?: { login?: string };
}

async function fetchGithubRepoMetadata(
  owner: string,
  repo: string,
  abortSignal?: AbortSignal,
): Promise<GithubRepoApiResponse | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'zetora-app',
    };
    if (serverEnv.GITHUB_TOKEN) headers.Authorization = `Bearer ${serverEnv.GITHUB_TOKEN}`;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: withAbort(abortSignal, GITHUB_API_TIMEOUT_MS),
    });

    if (!response.ok) return null;
    return (await response.json()) as GithubRepoApiResponse;
  } catch (error) {
    log.error(`GitHub API metadata fetch failed for ${owner}/${repo}:`, error);
    return null;
  }
}

// Enriches search results (from either Firecrawl or the fastCRW fallback) with
// authoritative repo metadata straight from the GitHub REST API, since neither
// search backend's scraped/snippet content reliably carries exact star counts,
// language, or last-push date.
async function enrichGithubResultsWithApi(
  results: GitHubResult[],
  abortSignal?: AbortSignal,
): Promise<GitHubResult[]> {
  const repoKeys = new Set<string>();
  for (const result of results) {
    const match = result.url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) repoKeys.add(`${match[1]}/${match[2]}`);
  }

  const entries = await Promise.all(
    Array.from(repoKeys).map(async (key) => {
      const [owner, repo] = key.split('/');
      return [key, await fetchGithubRepoMetadata(owner, repo, abortSignal)] as const;
    }),
  );
  const metaByRepo = new Map(entries);

  return results.map((result) => {
    const match = result.url.match(/github\.com\/([^/]+)\/([^/]+)/);
    const meta = match ? metaByRepo.get(`${match[1]}/${match[2]}`) : undefined;
    if (!meta) return result;

    const out: GitHubResult = { ...result };
    if (typeof meta.stargazers_count === 'number') out.stars = meta.stargazers_count;
    if (meta.language) out.language = meta.language;
    if (meta.description) out.description = meta.description;
    const publishedDate = meta.pushed_at || meta.updated_at;
    if (publishedDate) out.publishedDate = publishedDate;
    if (meta.owner?.login) out.author = meta.owner.login;
    return out;
  });
}

interface FastCrwSearchApiResponse {
  success: boolean;
  // fastCRW's own /v1/search wraps its result list one level deeper than the
  // Firecrawl-compatible shape you'd expect — verified live: the top-level
  // `data` field is `{ results: [...] }`, not the array itself.
  data: {
    results: Array<{
      url: string;
      title: string;
      snippet: string;
      description: string;
      score: number;
      category: string;
    }>;
  };
}

async function searchGithubWithFastCrw(
  baseUrl: string,
  query: string,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<GitHubResult[]> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `${query} site:github.com`, limit }),
    signal: withAbort(abortSignal, FASTCRW_SEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`fastCRW returned ${response.status}`);
  }

  const data: FastCrwSearchApiResponse = await response.json();

  return (data.data?.results || [])
    .filter((r) => isGitHubRepoUrl(r.url))
    .map((r) => {
      const authorMatch = r.url.match(/github\.com\/([^/]+)/);
      const out: GitHubResult = {
        url: r.url,
        title: r.title || r.url,
        content: r.snippet || r.description || '',
      };
      if (authorMatch) out.author = authorMatch[1];
      return out;
    });
}

interface SearxngResult {
  url: string;
  title: string;
  content: string;
}

async function searchGithubWithSearxng(
  baseUrl: string,
  query: string,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<GitHubResult[]> {
  const params = new URLSearchParams({
    q: query,
    engines: 'github',
    format: 'json',
    safesearch: '1',
  });

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/search?${params.toString()}`, {
    signal: withAbort(abortSignal, SEARXNG_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`SearXNG returned ${response.status}`);
  }

  const data: { results?: SearxngResult[] } = await response.json();

  return (data.results || [])
    .filter((r) => isGitHubRepoUrl(r.url))
    .slice(0, limit)
    .map((r) => {
      const authorMatch = r.url.match(/github\.com\/([^/]+)/);
      const out: GitHubResult = {
        url: r.url,
        title: r.title || r.url,
        content: r.content || '',
      };
      if (authorMatch) out.author = authorMatch[1];
      return out;
    });
}

type GithubSearchProvider = 'firecrawl' | 'searxng' | 'fastcrw';

function normalizeGithubProvider(value: unknown): GithubSearchProvider {
  if (value === 'firecrawl' || value === 'searxng' || value === 'fastcrw') return value;
  return 'firecrawl';
}

async function runGithubProvider(
  provider: GithubSearchProvider,
  query: string,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<GitHubResult[]> {
  if (provider === 'searxng') {
    if (!serverEnv.SEARXNG_URL) {
      log.warn('SearXNG provider selected for GitHub search but SEARXNG_URL is not configured');
      return [];
    }
    return searchGithubWithSearxng(serverEnv.SEARXNG_URL, query, limit, abortSignal);
  }

  if (provider === 'fastcrw') {
    if (!serverEnv.FASTCRW_URL) {
      log.warn('fastCRW provider selected for GitHub search but FASTCRW_URL is not configured');
      return [];
    }
    return searchGithubWithFastCrw(serverEnv.FASTCRW_URL, query, limit, abortSignal);
  }

  const firecrawlResults = await firecrawl.search(query, {
    categories: ['github'],
    limit,
    scrapeOptions: {
      formats: ['markdown'],
      storeInCache: true,
      proxy: 'auto',
    },
  });

  if (!firecrawlResults.web || !Array.isArray(firecrawlResults.web)) return [];

  return firecrawlResults.web
    .map((result): GitHubResult | null => {
      const url = getGitHubResultUrl(result);
      if (!isGitHubRepoUrl(url)) return null;

      const r = result as any;
      const title =
        (typeof r?.title === 'string' ? r.title : undefined) ||
        (typeof r?.metadata?.title === 'string' ? r.metadata.title : undefined) ||
        url;
      const description =
        (typeof r?.description === 'string' ? r.description : undefined) ||
        (typeof r?.metadata?.description === 'string' ? r.metadata.description : undefined) ||
        '';
      const markdown = typeof r?.markdown === 'string' ? r.markdown : '';

      const authorMatch = url.match(/github\.com\/([^/]+)/);
      const author = authorMatch ? authorMatch[1] : undefined;
      const image = typeof r?.metadata?.ogImage === 'string' ? r.metadata.ogImage : undefined;
      const favicon = typeof r?.metadata?.favicon === 'string' ? r.metadata.favicon : undefined;

      const out: GitHubResult = {
        url,
        title,
        content: description || markdown,
      };
      if (author) out.author = author;
      if (image) out.image = image;
      if (favicon) out.favicon = favicon;
      if (description) out.description = description.substring(0, 300);

      return out;
    })
    .filter((r): r is GitHubResult => r !== null);
}

export type GitHubResult = {
  url: string;
  title: string;
  content: string;
  publishedDate?: string;
  author?: string;
  image?: string;
  favicon?: string;
  stars?: number;
  language?: string;
  description?: string;
};

export function githubSearchTool(dataStream?: UIMessageStreamWriter<ChatMessage>, preferences?: Record<string, unknown>) {
  const provider = normalizeGithubProvider(preferences?.['zetora-github-search-provider']);
  const fallbackEnabled = preferences?.['zetora-github-search-fallback-enabled'] !== false;
  const fallbackProvider = fallbackEnabled
    ? normalizeGithubProvider(preferences?.['zetora-github-search-fallback-provider'] ?? 'fastcrw')
    : null;

  return tool({
    description: 'Search GitHub using Firecrawl with multiple queries.',
    inputSchema: z.object({
      queries: z
        .array(z.string().max(200))
        .describe('Array of search queries to execute on GitHub. Minimum 1, recommended 3-5.')
        .min(1)
        .max(5),
      maxResults: z
        .array(z.number())
        .optional()
        .describe('Array of maximum results per query. Default is 10 per query.'),
      startDate: z
        .string()
        .optional()
        .describe('Start date for filtering results in ISO format (e.g., 2025-01-01T00:00:00.000Z)'),
      endDate: z
        .string()
        .optional()
        .describe('End date for filtering results in ISO format (e.g., 2025-12-31T23:59:59.999Z)'),
    }),
    execute: async (
      {
        queries,
        maxResults,
        startDate,
        endDate,
      }: {
        queries: string[];
        maxResults?: number[];
        startDate?: string;
        endDate?: string;
      },
      { abortSignal }: { abortSignal?: AbortSignal },
    ) => {
      log.debug('GitHub search queries:', queries);
      log.debug('Max results:', maxResults);
      log.debug('Date range:', startDate, '-', endDate);

      const searchPromises = queries.map(async (query, index) => {
        const currentMaxResults = maxResults?.[index] || maxResults?.[0] || 10;

        try {
          // Send start notification
          dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index,
              total: queries.length,
              status: 'started',
              resultsCount: 0,
              imagesCount: 0,
            },
          });

          let processedResults: GitHubResult[] = [];
          try {
            processedResults = await runGithubProvider(provider, query, currentMaxResults, abortSignal);
          } catch (primaryError) {
            log.error(`GitHub search ${provider} error for query "${query}":`, primaryError);
          }

          if (processedResults.length === 0 && fallbackProvider && fallbackProvider !== provider) {
            try {
              log.debug(`GitHub search: ${provider} returned no results, falling back to ${fallbackProvider}`);
              processedResults = await runGithubProvider(fallbackProvider, query, currentMaxResults, abortSignal);
            } catch (fallbackError) {
              log.error(`GitHub search ${fallbackProvider} fallback error for query "${query}":`, fallbackError);
            }
          }

          if (processedResults.length > 0) {
            processedResults = await enrichGithubResultsWithApi(processedResults, abortSignal);
          }

          if (processedResults.length === 0) {
            dataStream?.write({
              type: 'data-query_completion',
              data: {
                query,
                index,
                total: queries.length,
                status: 'completed',
                resultsCount: 0,
                imagesCount: 0,
              },
            });

            return {
              query,
              results: [],
            };
          }

          const resultsCount = processedResults.length;

          // Send completion notification
          dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index,
              total: queries.length,
              status: 'completed',
              resultsCount: resultsCount,
              imagesCount: 0,
            },
          });

          return {
            query,
            results: processedResults,
          };
        } catch (error) {
          log.error(`GitHub search error for query "${query}":`, error);

          // Send error notification
          dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index,
              total: queries.length,
              status: 'error',
              resultsCount: 0,
              imagesCount: 0,
            },
          });

          return {
            query,
            results: [],
          };
        }
      });

      const searchMap = await all(
        Object.fromEntries(searchPromises.map((promise, index) => [`q:${index}`, async () => promise])),
        getBetterAllOptions(),
      );
      const searches = queries.map((_, index) => searchMap[`q:${index}`]);

      return {
        searches,
      };
    },
  });
}
