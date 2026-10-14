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
export const METADATA_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_METADATA', 10_000);
// Slightly above the server-side maxDurationMinutes (2 min) Notte enforces.
export const NOTTE_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_NOTTE', 150_000);
// Attachments and files fetched for the model (uploads, file parts).
export const ATTACHMENT_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_ATTACHMENT', 30_000);
// MCP OAuth discovery, registration and token requests.
export const MCP_OAUTH_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_MCP_OAUTH', 15_000);
export const GITHUB_API_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_GITHUB_API', 10_000);
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

// Exported for tests.
export const _envMs = envMs;
