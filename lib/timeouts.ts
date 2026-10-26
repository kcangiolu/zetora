// Timeouts for outbound calls to self-hosted services. None of these fetches
// had a timeout before, so a single unresponsive container (SearXNG, fastCRW,
// the metadata scraper…) would hang a search step forever. Every value can be
// overridden via env for slow deployments.

function envMs(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

export const SEARXNG_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_SEARXNG', 15_000);
export const FASTCRW_SEARCH_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_FASTCRW_SEARCH', 20_000);
export const FASTCRW_SCRAPE_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_FASTCRW_SCRAPE', 30_000);
// Budget fastCRW gets for each page of a batch (search results, browsePage).
// A batch waits for its slowest page, so a page behind an anti-bot wall would
// otherwise hold every answer for the ~30s fastCRW takes to give up on it.
// A single page the user asked for (retrieve) keeps fastCRW's own deadline.
export const FASTCRW_SCRAPE_DEADLINE_MS = envMs('ZETORA_FASTCRW_SCRAPE_DEADLINE', 8_000);
// The LLM reranking of hybrid search results holds every web_search answer
// until it returns; past this budget the fused order is kept instead.
export const RERANK_TIMEOUT_MS = envMs('ZETORA_RERANK_TIMEOUT', 10_000);
export const METADATA_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_METADATA', 10_000);
// Slightly above the server-side maxDurationMinutes (2 min) Notte enforces.
export const NOTTE_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_NOTTE', 150_000);
// Attachments and files fetched for the model (uploads, file parts).
export const ATTACHMENT_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_ATTACHMENT', 30_000);
// MCP OAuth discovery, registration and token requests.
export const MCP_OAUTH_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_MCP_OAUTH', 15_000);
// Third-party APIs called by tools (maps, weather, TMDB, CoinGecko, Spotify...).
export const EXTERNAL_API_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_EXTERNAL_API', 20_000);
// Bundled services reached over the compose network (Qdrant, the Hermes relay).
export const INTERNAL_SERVICE_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_INTERNAL_SERVICE', 15_000);
export const GITHUB_API_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_GITHUB_API', 10_000);
// Redis commands of the app's key/value clients, including the time spent
// queued while Redis is unreachable.
export const REDIS_COMMAND_TIMEOUT_MS = envMs('ZETORA_REDIS_COMMAND_TIMEOUT', 5_000);
// exa-js has no client-side request timeout or retry of its own (plain
// `fetch` with no `signal`), so a slow/hanging Exa API call blocks its query
// indefinitely instead of failing fast like the other providers.
export const EXA_SEARCH_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_EXA', 30_000);

// Wall-clock budget for an extreme-search agent run (its 25-75 sequential
// steps are unbounded in time otherwise). 0 disables the request timer.
export const EXTREME_WALL_CLOCK_MS = envMs('ZETORA_EXTREME_WALL_CLOCK_MS', 10 * 60_000);
export const SEARCH_REQUEST_TIMEOUT_MS = envMs('SEARCH_REQUEST_TIMEOUT_MS', 20 * 60_000);

export function isPastDeadline(deadlineMs: number, nowMs: number = Date.now()): boolean {
  return nowMs > deadlineMs;
}

// A fixed timeout alone ignores the caller's own cancellation (e.g. the user
// hitting Stop mid-search) and keeps the fetch running for up to `timeoutMs`
// regardless. Combine both so either one can end the request.
export function withAbort(externalSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;
}

// For SDK calls that take no abort signal: the call keeps running in the
// background, but the caller stops waiting for it.
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Exported for tests.
export const _envMs = envMs;
