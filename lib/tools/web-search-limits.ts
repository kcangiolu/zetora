// Hard caps on the web_search fan-out, applied after the strategy runs so
// they hold for every provider (SearXNG, fastCRW, Exa, Firecrawl, …). The
// tool description asks the model for 2-4 queries × 8 results, but local
// models routinely ignore prompt-level limits — these clamps are the actual
// bound on how many tokens a single web_search round injects back into the
// conversation. GLOBAL_RESULT_CAP and SNIPPET_MAX_CHARS are env-overridable
// for deployments that want a deeper/latency-tolerant search (self-hosted
// stacks where thoroughness matters more than speed).

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const MAX_QUERIES = 4;
export const MIN_RESULTS_PER_QUERY = 3;
export const MAX_RESULTS_PER_QUERY = 10;
export const DEFAULT_RESULTS_PER_QUERY = 8;
const GLOBAL_RESULT_CAP = envInt('ZETORA_SEARCH_GLOBAL_CAP', 32);
const PER_DOMAIN_CAP = envInt('ZETORA_SEARCH_PER_DOMAIN_CAP', 3);
const SNIPPET_MAX_CHARS = envInt('ZETORA_SEARCH_SNIPPET_MAX_CHARS', 600);

export const _envInt = envInt;

export interface SearchResultItem {
  url: string;
  title: string;
  content: string;
  published_date?: string;
  author?: string;
  [key: string]: unknown;
}

export interface SearchEntry {
  query: string;
  results: SearchResultItem[];
  images?: unknown[];
}

export function clampSearchInput<T extends { queries: string[]; maxResults?: (number | undefined)[] }>(
  input: T,
): T {
  const queries = input.queries.slice(0, MAX_QUERIES);
  const maxResults = queries.map((_, i) => {
    const requested = input.maxResults?.[i] ?? DEFAULT_RESULTS_PER_QUERY;
    return Math.min(Math.max(requested, MIN_RESULTS_PER_QUERY), MAX_RESULTS_PER_QUERY);
  });
  return { ...input, queries, maxResults };
}

// Strips fragments, tracking params and trailing slashes so the same page
// reached through different queries counts as one result.
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid' || key === 'ref') {
        url.searchParams.delete(key);
      }
    }
    let normalized = url.toString();
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized.toLowerCase();
  } catch {
    return rawUrl.toLowerCase();
  }
}

function domainOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}

// Truncates at the last word boundary before the limit; prefixes the
// publication date so the model can weigh recency without extra fields.
export function formatSnippet(result: SearchResultItem, maxChars: number = SNIPPET_MAX_CHARS): string {
  const datePrefix = result.published_date ? `(${String(result.published_date).slice(0, 10)}) ` : '';
  const budget = maxChars - datePrefix.length;
  let content = result.content ?? '';
  if (content.length > budget) {
    const cut = content.slice(0, budget - 1); // leave room for the ellipsis
    const lastSpace = cut.lastIndexOf(' ');
    content = (lastSpace > budget / 2 ? cut.slice(0, lastSpace) : cut) + '…';
  }
  return datePrefix + content;
}

/**
 * Deduplicates URLs across queries, caps results per domain and globally
 * (round-robin across queries so each query keeps its best hits), and
 * truncates snippets. Structure (per-query grouping) is preserved.
 */
export function dedupeAndCapSearches<T extends SearchEntry>(
  searches: T[],
  {
    globalCap = GLOBAL_RESULT_CAP,
    perDomainCap = PER_DOMAIN_CAP,
    snippetMaxChars = SNIPPET_MAX_CHARS,
  }: { globalCap?: number; perDomainCap?: number; snippetMaxChars?: number } = {},
): T[] {
  const seenUrls = new Set<string>();
  const domainCounts = new Map<string, number>();
  const kept: SearchResultItem[][] = searches.map(() => []);
  let total = 0;

  // Round-robin: take the i-th result of each query in turn so the global
  // cap trims the tails, not whole queries.
  const maxLen = Math.max(0, ...searches.map((s) => s.results.length));
  outer: for (let rank = 0; rank < maxLen; rank++) {
    for (let q = 0; q < searches.length; q++) {
      const result = searches[q].results[rank];
      if (!result) continue;

      const urlKey = normalizeUrl(result.url);
      if (seenUrls.has(urlKey)) continue;

      const domain = domainOf(result.url);
      if ((domainCounts.get(domain) ?? 0) >= perDomainCap) continue;

      seenUrls.add(urlKey);
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      kept[q].push({ ...result, content: formatSnippet(result, snippetMaxChars) });
      total++;
      if (total >= globalCap) break outer;
    }
  }

  return searches.map((search, q) => ({ ...search, results: kept[q] }));
}

export interface ScrapedContent {
  url: string;
  content: string;
}

// Replaces the truncated snippet with full page content for queries the
// model flagged as 'best' quality — a 400-char snippet can't verify a
// number, but the full page usually can. Runs after dedupeAndCapSearches so
// it only pays the scrape cost for results that survived deduping/capping,
// and only overwrites a snippet when the scrape actually got more text.
export async function enrichBestQualityResults<T extends SearchEntry>(
  searches: T[],
  quality: ('default' | 'best')[] | undefined,
  scrapeUrls: (urls: string[]) => Promise<ScrapedContent[]>,
  topN: number = 3,
): Promise<T[]> {
  if (!quality?.some((q) => q === 'best')) return searches;

  const urlsToScrape = new Set<string>();
  searches.forEach((search, i) => {
    if (quality[i] !== 'best') return;
    search.results.slice(0, topN).forEach((r) => urlsToScrape.add(r.url));
  });
  if (urlsToScrape.size === 0) return searches;

  let scraped: ScrapedContent[];
  try {
    scraped = await scrapeUrls(Array.from(urlsToScrape));
  } catch (error) {
    console.error('enrichBestQualityResults: scrape failed, keeping snippets:', error);
    return searches;
  }

  const contentByUrl = new Map(
    scraped.filter((s) => s.content?.trim()).map((s) => [normalizeUrl(s.url), s.content]),
  );
  if (contentByUrl.size === 0) return searches;

  return searches.map((search, i) => {
    if (quality[i] !== 'best') return search;
    return {
      ...search,
      results: search.results.map((r, idx) => {
        if (idx >= topN) return r;
        const full = contentByUrl.get(normalizeUrl(r.url));
        return full && full.length > r.content.length ? { ...r, content: full } : r;
      }),
    };
  });
}
