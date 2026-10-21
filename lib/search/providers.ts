import type { InstanceCapabilities } from '@/lib/instance/capabilities';

// Which search providers can serve each search function, in the order a
// default is picked when the user hasn't chosen one (or chose one this
// instance doesn't have): the instance's self-hosted services first, then
// cloud APIs. Only providers the instance has configured are ever picked —
// see lib/instance/capabilities.ts.
export const SEARCH_PROVIDER_IDS = ['searxng', 'fastcrw', 'exa', 'firecrawl', 'parallel', 'notte'] as const;
export type SearchProviderId = (typeof SEARCH_PROVIDER_IDS)[number];

export const SEARCH_FUNCTION_PROVIDERS = {
  web: ['searxng', 'fastcrw', 'exa', 'firecrawl', 'parallel'],
  // Parallel AI has no query-based search endpoint usable here.
  extremeSearch: ['searxng', 'fastcrw', 'exa', 'firecrawl'],
  // Fetches a found URL's full content: SearXNG, a metasearch aggregator,
  // never does; Notte adds real headless-browser rendering.
  extremeContent: ['fastcrw', 'exa', 'firecrawl', 'parallel', 'notte'],
  // Exa and Parallel AI have no github/code category in their APIs.
  github: ['searxng', 'fastcrw', 'firecrawl'],
  // Parallel AI has no academic/PDF category.
  academic: ['searxng', 'fastcrw', 'exa', 'firecrawl'],
  // Extracts a single URL's content, so no SearXNG.
  retrieve: ['fastcrw', 'exa', 'firecrawl', 'parallel'],
  // Exa's index carries essentially no reddit.com content.
  reddit: ['searxng', 'fastcrw', 'firecrawl', 'parallel'],
} as const satisfies Record<string, readonly SearchProviderId[]>;

export type SearchFunction = keyof typeof SEARCH_FUNCTION_PROVIDERS;
export type SearchProviderFor<F extends SearchFunction> = (typeof SEARCH_FUNCTION_PROVIDERS)[F][number];

export function searchProvidersFor<F extends SearchFunction>(
  fn: F,
  available: readonly SearchProviderId[],
): SearchProviderFor<F>[] {
  return (SEARCH_FUNCTION_PROVIDERS[fn] as readonly SearchProviderFor<F>[]).filter((id) => available.includes(id));
}

// The user's choice when this instance has it, else the first available
// provider in order; null when the instance has none for this function.
export function pickSearchProvider<F extends SearchFunction>(
  fn: F,
  preferred: unknown,
  available: readonly SearchProviderId[],
): SearchProviderFor<F> | null {
  const candidates = searchProvidersFor(fn, available);
  return candidates.find((id) => id === preferred) ?? candidates[0] ?? null;
}

// Same, for the provider retried when the primary one returns nothing:
// never the primary itself.
export function pickFallbackSearchProvider<F extends SearchFunction>(
  fn: F,
  preferred: unknown,
  primary: SearchProviderFor<F>,
  available: readonly SearchProviderId[],
): SearchProviderFor<F> | null {
  const candidates = searchProvidersFor(fn, available).filter((id) => id !== primary);
  return candidates.find((id) => id === preferred) ?? candidates[0] ?? null;
}

// Chat sources that need a search function: hidden when the instance has no
// provider for it (and while the instance's capabilities are still loading).
const SEARCH_GROUP_FUNCTIONS: Partial<Record<string, SearchFunction>> = {
  web: 'web',
  academic: 'academic',
  reddit: 'reddit',
  github: 'github',
  extreme: 'extremeSearch',
  'extreme-search': 'extremeSearch',
};

export function isSearchGroupAvailable(
  groupId: string,
  capabilities: Pick<InstanceCapabilities, 'searchProviders' | 'unavailableSources'> | undefined,
): boolean {
  if (capabilities?.unavailableSources.includes(groupId)) return false;
  const fn = SEARCH_GROUP_FUNCTIONS[groupId];
  if (!fn) return true;
  return capabilities !== undefined && searchProvidersFor(fn, capabilities.searchProviders).length > 0;
}
