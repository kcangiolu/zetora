import 'server-only';

import { serverEnv } from '@/env/server';
import { isConfigured } from '@/ai/catalog/env';
import {
  SEARCH_PROVIDER_IDS,
  pickFallbackSearchProvider,
  pickSearchProvider,
  searchProvidersFor,
  type SearchFunction,
  type SearchProviderFor,
  type SearchProviderId,
} from '@/lib/search/providers';

// What this instance has, read from its .env: the optional bundled services
// it runs and the cloud APIs it holds keys for. The UI only offers these, and
// the server only ever uses these.
export interface InstanceCapabilities {
  searchProviders: SearchProviderId[];
  // Qdrant: the Hybrid Search settings and the SearXNG archive results.
  hybridSearch: boolean;
  // Presidio: the Data protection settings.
  anonymization: boolean;
  // s2s-service: the local Voice backend.
  localVoice: boolean;
}

const SEARCH_PROVIDER_CONFIGURED: Record<SearchProviderId, () => boolean> = {
  searxng: () => Boolean(serverEnv.SEARXNG_URL),
  fastcrw: () => Boolean(serverEnv.FASTCRW_URL),
  exa: () => isConfigured(serverEnv.EXA_API_KEY),
  firecrawl: () => isConfigured(serverEnv.FIRECRAWL_API_KEY),
  parallel: () => isConfigured(serverEnv.PARALLEL_API_KEY),
  notte: () => isConfigured(serverEnv.NOTTE_API_KEY),
};

export function getAvailableSearchProviders(): SearchProviderId[] {
  return SEARCH_PROVIDER_IDS.filter((id) => SEARCH_PROVIDER_CONFIGURED[id]());
}

export function isHybridSearchAvailable(): boolean {
  return Boolean(serverEnv.QDRANT_URL);
}

export function isAnonymizationAvailable(): boolean {
  return Boolean(serverEnv.ANONYMIZER_API_URL);
}

export function isLocalVoiceAvailable(): boolean {
  return Boolean(process.env.VOICE_S2S_URL?.trim());
}

export function getInstanceCapabilities(): InstanceCapabilities {
  return {
    searchProviders: getAvailableSearchProviders(),
    hybridSearch: isHybridSearchAvailable(),
    anonymization: isAnonymizationAvailable(),
    localVoice: isLocalVoiceAvailable(),
  };
}

// The search function each search tool needs a provider for.
const SEARCH_TOOL_FUNCTIONS: Record<string, SearchFunction> = {
  web_search: 'web',
  academic_search: 'academic',
  reddit_search: 'reddit',
  github_search: 'github',
  retrieve: 'retrieve',
  extreme_search: 'extremeSearch',
};

// False for a search tool this instance has no provider for: it is never offered.
export function isSearchToolAvailable(toolName: string): boolean {
  const fn = SEARCH_TOOL_FUNCTIONS[toolName];
  return !fn || searchProvidersFor(fn, getAvailableSearchProviders()).length > 0;
}

export function resolveSearchProvider<F extends SearchFunction>(
  fn: F,
  preferred: unknown,
): SearchProviderFor<F> | null {
  return pickSearchProvider(fn, preferred, getAvailableSearchProviders());
}

export function resolveFallbackSearchProvider<F extends SearchFunction>(
  fn: F,
  preferred: unknown,
  primary: SearchProviderFor<F>,
): SearchProviderFor<F> | null {
  return pickFallbackSearchProvider(fn, preferred, primary, getAvailableSearchProviders());
}
