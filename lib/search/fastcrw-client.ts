import { FASTCRW_SEARCH_TIMEOUT_MS, withAbort } from '@/lib/timeouts';

// The one place that calls fastCRW's search API; every tool that searches
// through fastCRW goes through it, so the timeout and cancellation apply
// everywhere.

export interface FastCrwHit {
  url: string;
  title: string;
  content: string;
}

interface FastCrwSearchResponse {
  // fastCRW's `data` is `{ results: [...] }`, not the array itself, despite the
  // Firecrawl-compatible framing.
  data?: {
    results?: Array<{ url: string; title?: string; snippet?: string; description?: string }>;
  };
}

/** Throws on a network error, a timeout or a non-2xx response. */
export async function fastCrwSearch(
  baseUrl: string,
  request: { query: string; limit: number; category?: 'news' },
  abortSignal?: AbortSignal,
): Promise<FastCrwHit[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: withAbort(abortSignal, FASTCRW_SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`fastCRW returned ${response.status}`);
  }

  const data: FastCrwSearchResponse = await response.json();
  return (data.data?.results ?? []).map((r) => ({
    url: r.url,
    title: r.title || '',
    content: r.snippet || r.description || '',
  }));
}
