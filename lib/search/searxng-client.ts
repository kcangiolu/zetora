import { SEARXNG_TIMEOUT_MS, withAbort } from '@/lib/timeouts';

// The one place that calls SearXNG's JSON search API; every tool that
// searches through SearXNG goes through it, so the timeout and cancellation
// apply everywhere.

export interface SearxngHit {
  url: string;
  title: string;
  content: string;
  publishedDate?: string;
  score?: number;
}

export interface SearxngQuery {
  q: string;
  categories?: string;
  engines?: string;
  // 'all' disables SearXNG's language filter, so a non-English query gets
  // results in its own language. Omitted, SearXNG applies its own default.
  language?: string;
  time_range?: string;
}

// SearXNG only supports coarse time ranges: pick the smallest one that still
// covers the requested start date (other providers filter exactly).
export function searxngTimeRange(topic: 'general' | 'news', startDate?: string | null): string {
  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime())) {
      const ageDays = (Date.now() - start.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays <= 1) return 'day';
      if (ageDays <= 7) return 'week';
      if (ageDays <= 31) return 'month';
      return 'year';
    }
  }
  return topic === 'news' ? 'week' : '';
}

/** Throws on a network error, a timeout or a non-2xx response. */
export async function searxngSearch(
  baseUrl: string,
  query: SearxngQuery,
  abortSignal?: AbortSignal,
): Promise<SearxngHit[]> {
  const params = new URLSearchParams({ format: 'json', safesearch: '1' });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/search?${params.toString()}`, {
    signal: withAbort(abortSignal, SEARXNG_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`SearXNG returned ${response.status}`);
  }

  const data: { results?: SearxngHit[] } = await response.json();
  return data.results ?? [];
}
