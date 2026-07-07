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
export const GRAPHITI_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_GRAPHITI', 30_000);
// exa-js has no client-side request timeout or retry of its own (plain
// `fetch` with no `signal`), so a slow/hanging Exa API call blocks its query
// indefinitely instead of failing fast like the other providers.
export const EXA_SEARCH_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_EXA', 30_000);
// Episode ingestion runs LLM entity extraction server-side — on a local
// single-slot llama.cpp that can legitimately take minutes.
export const GRAPHITI_INGEST_TIMEOUT_MS = envMs('ZETORA_FETCH_TIMEOUT_GRAPHITI_INGEST', 180_000);

// Wall-clock budget for an extreme-search agent run (its 25-75 sequential
// steps are unbounded in time otherwise). 0 disables the request timer.
export const EXTREME_WALL_CLOCK_MS = envMs('ZETORA_EXTREME_WALL_CLOCK_MS', 10 * 60_000);
export const SEARCH_REQUEST_TIMEOUT_MS = envMs('SEARCH_REQUEST_TIMEOUT_MS', 20 * 60_000);

export function isPastDeadline(deadlineMs: number, nowMs: number = Date.now()): boolean {
  return nowMs > deadlineMs;
}

// Exported for tests.
export const _envMs = envMs;
