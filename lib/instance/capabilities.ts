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

function getAvailableSearchProviders(): SearchProviderId[] {
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

// Tools that call a cloud API with the instance's own key.
const TOOL_KEYS_CONFIGURED: Record<string, () => boolean> = {
  stock_chart: () => isConfigured(serverEnv.VALYU_API_KEY),
  currency_converter: () => isConfigured(serverEnv.VALYU_API_KEY),
  prediction_search: () => isConfigured(serverEnv.VALYU_API_KEY),
  coin_data: () => isConfigured(serverEnv.COINGECKO_API_KEY),
  coin_data_by_contract: () => isConfigured(serverEnv.COINGECKO_API_KEY),
  coin_ohlc: () => isConfigured(serverEnv.COINGECKO_API_KEY),
  x_search: () => isConfigured(serverEnv.XAI_API_KEY),
  youtube_search: () => isConfigured(serverEnv.SUPADATA_API_KEY),
  spotify_search: () => isConfigured(serverEnv.SPOTIFY_CLIENT_ID) && isConfigured(serverEnv.SPOTIFY_CLIENT_SECRET),
  movie_or_tv_search: () => isConfigured(serverEnv.TMDB_API_KEY),
  trending_movies: () => isConfigured(serverEnv.TMDB_API_KEY),
  trending_tv: () => isConfigured(serverEnv.TMDB_API_KEY),
  find_place_on_map: () => isConfigured(serverEnv.GOOGLE_MAPS_API_KEY),
  nearby_places_search: () => isConfigured(serverEnv.GOOGLE_MAPS_API_KEY),
  get_weather_data: () => isConfigured(serverEnv.OPENWEATHER_API_KEY),
  track_flight: () => isConfigured(serverEnv.AMADEUS_API_KEY) && isConfigured(serverEnv.AMADEUS_API_SECRET),
  code_context: () => isConfigured(serverEnv.EXA_API_KEY),
};

// False for a tool this instance cannot run: a search tool with no provider,
// or a tool whose API key is not set. Such a tool is never offered.
export function isToolAvailable(toolName: string): boolean {
  const fn = SEARCH_TOOL_FUNCTIONS[toolName];
  if (fn && searchProvidersFor(fn, getAvailableSearchProviders()).length === 0) return false;
  return TOOL_KEYS_CONFIGURED[toolName]?.() ?? true;
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
