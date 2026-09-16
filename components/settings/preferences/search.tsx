'use client';

import type { SettingsUser } from '../shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelectorDialog } from '@/components/ui/model-selector';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { type Model } from '@/ai/models';
import { sileo } from 'sileo';
import { Search, X } from 'lucide-react';
import {
  searchProviders,
  githubSearchProviders,
  academicSearchProviders,
  retrieveProviders,
  redditSearchProviders,
  extremeSearchProviders,
  extremeContentProviders,
  type CustomProviderConfig,
  parseCustomModel,
} from './shared';

export function SearchTab({
  user,
  customModelsList,
  customProviders,
}: {
  user: SettingsUser;
  customModelsList: Model[];
  customProviders: CustomProviderConfig[];
}) {
  const [searchProvider, setSearchProvider] = useSyncedPreferences<
    'exa' | 'parallel' | 'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-search-provider', 'exa');

  const [extremeSearchProvider, setExtremeSearchProvider] = useSyncedPreferences<
    'exa' | 'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-extreme-search-provider', 'exa');
  const [extremeSearchFallbackEnabled, setExtremeSearchFallbackEnabled] = useSyncedPreferences<boolean>(
    'zetora-extreme-search-fallback-enabled',
    true,
  );
  const [extremeSearchFallbackProvider, setExtremeSearchFallbackProvider] = useSyncedPreferences<
    'exa' | 'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-extreme-search-fallback-provider', 'firecrawl');

  const [extremeContentProvider, setExtremeContentProvider] = useSyncedPreferences<
    'exa' | 'firecrawl' | 'fastcrw' | 'notte' | 'parallel'
  >('zetora-extreme-content-provider', 'exa');
  const [extremeContentFallbackEnabled, setExtremeContentFallbackEnabled] = useSyncedPreferences<boolean>(
    'zetora-extreme-content-fallback-enabled',
    true,
  );
  const [extremeContentFallbackProvider, setExtremeContentFallbackProvider] = useSyncedPreferences<
    'exa' | 'firecrawl' | 'fastcrw' | 'notte' | 'parallel'
  >('zetora-extreme-content-fallback-provider', 'firecrawl');

  const [fallbackMetadata, setFallbackMetadata] = useSyncedPreferences<boolean>('zetora-fallback-metadata', true);
  const [fallbackSearchFirecrawl, setFallbackSearchFirecrawl] = useSyncedPreferences<boolean>(
    'zetora-fallback-search-firecrawl',
    true,
  );
  const [searchFallbackProvider, setSearchFallbackProvider] = useSyncedPreferences<
    'firecrawl' | 'exa' | 'parallel' | 'searxng' | 'fastcrw' | 'none'
  >('zetora-search-fallback-provider', 'firecrawl');

  const [githubSearchProvider, setGithubSearchProvider] = useSyncedPreferences<'firecrawl' | 'searxng' | 'fastcrw'>(
    'zetora-github-search-provider',
    'firecrawl',
  );
  const [githubFallbackEnabled, setGithubFallbackEnabled] = useSyncedPreferences<boolean>(
    'zetora-github-search-fallback-enabled',
    true,
  );
  const [githubSearchFallbackProvider, setGithubSearchFallbackProvider] = useSyncedPreferences<
    'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-github-search-fallback-provider', 'fastcrw');

  const [academicSearchProvider, setAcademicSearchProvider] = useSyncedPreferences<
    'exa' | 'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-academic-search-provider', 'firecrawl');
  const [academicFallbackEnabled, setAcademicFallbackEnabled] = useSyncedPreferences<boolean>(
    'zetora-academic-search-fallback-enabled',
    true,
  );
  const [academicSearchFallbackProvider, setAcademicSearchFallbackProvider] = useSyncedPreferences<
    'exa' | 'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-academic-search-fallback-provider', 'fastcrw');

  const [retrieveProvider, setRetrieveProvider] = useSyncedPreferences<'fastcrw' | 'exa' | 'parallel' | 'firecrawl'>(
    'zetora-retrieve-provider',
    'exa',
  );
  const [retrieveFallbackEnabled, setRetrieveFallbackEnabled] = useSyncedPreferences<boolean>(
    'zetora-retrieve-fallback-enabled',
    true,
  );
  const [retrieveFallbackProvider, setRetrieveFallbackProvider] = useSyncedPreferences<
    'fastcrw' | 'exa' | 'parallel' | 'firecrawl'
  >('zetora-retrieve-fallback-provider', 'fastcrw');

  const [redditSearchProvider, setRedditSearchProvider] = useSyncedPreferences<
    'parallel' | 'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-reddit-search-provider', 'parallel');
  const [redditFallbackEnabled, setRedditFallbackEnabled] = useSyncedPreferences<boolean>(
    'zetora-reddit-search-fallback-enabled',
    true,
  );
  const [redditSearchFallbackProvider, setRedditSearchFallbackProvider] = useSyncedPreferences<
    'parallel' | 'firecrawl' | 'searxng' | 'fastcrw'
  >('zetora-reddit-search-fallback-provider', 'searxng');

  const [embeddingEnabled, setEmbeddingEnabled] = useSyncedPreferences<boolean>('zetora-embedding-enabled', false);
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useSyncedPreferences<string>(
    'zetora-embedding-provider',
    '',
  );
  const [embeddingModel, setEmbeddingModel] = useSyncedPreferences<string>(
    'zetora-embedding-model',
    'nomic-embed-text',
  );

  const [fileEmbeddingProvider, setFileEmbeddingProvider] = useSyncedPreferences<'cohere' | 'custom'>(
    'zetora-file-embedding-provider',
    'cohere',
  );

  const [qdrantEnabled, setQdrantEnabled] = useSyncedPreferences<boolean>('zetora-qdrant-enabled', false);

  const [hybridSearchEnabled, setHybridSearchEnabled] = useSyncedPreferences<boolean>(
    'zetora-hybrid-search-enabled',
    false,
  );
  const [contentIndexingEnabled, setContentIndexingEnabled] = useSyncedPreferences<boolean>(
    'zetora-content-indexing-enabled',
    false,
  );
  const [rerankEnabled, setRerankEnabled] = useSyncedPreferences<boolean>('zetora-rerank-enabled', false);

  const handleSearchProviderChange = (newProvider: 'exa' | 'parallel' | 'firecrawl' | 'searxng' | 'fastcrw') => {
    setSearchProvider(newProvider);
    const labels: Record<typeof newProvider, string> = {
      exa: 'Exa',
      parallel: 'Parallel AI',
      firecrawl: 'Firecrawl',
      searxng: 'SearXNG',
      fastcrw: 'fastCRW',
    };
    sileo.success({
      title: `Search provider changed to ${labels[newProvider]}`,
      description: 'This will be used for all future searches',
      icon: <Search className="h-4 w-4" />,
    });
  };

  const handleEmbeddingModelSelect = (modelId: string) => {
    setSelectedEmbeddingProvider(modelId);
    if (modelId) {
      const parsed = parseCustomModel(modelId, customProviders);
      if (parsed) setEmbeddingModel(parsed.modelName);
    } else {
      setEmbeddingModel('nomic-embed-text');
    }
  };

  return (
    <>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Web Search Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Web Search Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engine used for general web searches</p>
            </div>
            <Select value={searchProvider} onValueChange={(v) => handleSearchProviderChange(v as any)}>
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {searchProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="size-3.5 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Fallback */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Web Search Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Retry with another provider when the primary one returns no results
              </p>
            </div>
            <Switch checked={fallbackSearchFirecrawl} onCheckedChange={setFallbackSearchFirecrawl} />
          </div>
          {fallbackSearchFirecrawl && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Fallback Provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Which provider to retry with (skipped automatically when it matches your primary provider)
                </p>
              </div>
              <Select
                value={searchFallbackProvider}
                onValueChange={(v) => setSearchFallbackProvider(v as typeof searchFallbackProvider)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {searchProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <p.icon className="size-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* GitHub Search Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">GitHub Search Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engine used for the GitHub search tool</p>
            </div>
            <Select
              value={githubSearchProvider}
              onValueChange={(v) => setGithubSearchProvider(v as typeof githubSearchProvider)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {githubSearchProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="size-3.5 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">GitHub Search Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Retry with another provider when the primary one returns no results
              </p>
            </div>
            <Switch checked={githubFallbackEnabled} onCheckedChange={setGithubFallbackEnabled} />
          </div>
          {githubFallbackEnabled && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">GitHub Fallback Provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Which provider to retry with (skipped automatically when it matches your primary provider)
                </p>
              </div>
              <Select
                value={githubSearchFallbackProvider}
                onValueChange={(v) => setGithubSearchFallbackProvider(v as typeof githubSearchFallbackProvider)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {githubSearchProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <p.icon className="size-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Academic Search Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Academic Search Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engine used for the academic search tool</p>
            </div>
            <Select
              value={academicSearchProvider}
              onValueChange={(v) => setAcademicSearchProvider(v as typeof academicSearchProvider)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {academicSearchProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="size-3.5 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Academic Search Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Retry with another provider when the primary one returns no results
              </p>
            </div>
            <Switch checked={academicFallbackEnabled} onCheckedChange={setAcademicFallbackEnabled} />
          </div>
          {academicFallbackEnabled && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Academic Fallback Provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Which provider to retry with (skipped automatically when it matches your primary provider)
                </p>
              </div>
              <Select
                value={academicSearchFallbackProvider}
                onValueChange={(v) => setAcademicSearchFallbackProvider(v as typeof academicSearchFallbackProvider)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {academicSearchProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <p.icon className="size-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Retrieve Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Retrieve Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Engine used to extract content from a URL the user shares directly
              </p>
            </div>
            <Select value={retrieveProvider} onValueChange={(v) => setRetrieveProvider(v as typeof retrieveProvider)}>
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {retrieveProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="size-3.5 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Retrieve Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Retry with another provider when the primary one returns no content
              </p>
            </div>
            <Switch checked={retrieveFallbackEnabled} onCheckedChange={setRetrieveFallbackEnabled} />
          </div>
          {retrieveFallbackEnabled && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Retrieve Fallback Provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Which provider to retry with (skipped automatically when it matches your primary provider)
                </p>
              </div>
              <Select
                value={retrieveFallbackProvider}
                onValueChange={(v) => setRetrieveFallbackProvider(v as typeof retrieveFallbackProvider)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retrieveProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <p.icon className="size-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Reddit Search Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Reddit Search Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engine used for the Reddit search tool</p>
            </div>
            <Select
              value={redditSearchProvider}
              onValueChange={(v) => setRedditSearchProvider(v as typeof redditSearchProvider)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {redditSearchProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="size-3.5 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Reddit Search Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Retry with another provider when the primary one returns no results
              </p>
            </div>
            <Switch checked={redditFallbackEnabled} onCheckedChange={setRedditFallbackEnabled} />
          </div>
          {redditFallbackEnabled && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Reddit Fallback Provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Which provider to retry with (skipped automatically when it matches your primary provider)
                </p>
              </div>
              <Select
                value={redditSearchFallbackProvider}
                onValueChange={(v) => setRedditSearchFallbackProvider(v as typeof redditSearchFallbackProvider)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {redditSearchProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <p.icon className="size-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Extreme Search Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Extreme Search Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engine used to find URLs for Extreme Agent</p>
            </div>
            <Select
              value={extremeSearchProvider}
              onValueChange={(v) => setExtremeSearchProvider(v as typeof extremeSearchProvider)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {extremeSearchProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="size-3.5 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Extreme Search Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Retry with another provider when the primary one returns no results
              </p>
            </div>
            <Switch checked={extremeSearchFallbackEnabled} onCheckedChange={setExtremeSearchFallbackEnabled} />
          </div>
          {extremeSearchFallbackEnabled && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Extreme Search Fallback Provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Which provider to retry with (skipped automatically when it matches your primary provider)
                </p>
              </div>
              <Select
                value={extremeSearchFallbackProvider}
                onValueChange={(v) => setExtremeSearchFallbackProvider(v as typeof extremeSearchFallbackProvider)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {extremeSearchProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <p.icon className="size-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Extreme Content Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Extreme Content Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Engine used to extract content from found URLs (also used by BrowsePage)
              </p>
            </div>
            <Select
              value={extremeContentProvider}
              onValueChange={(v) => setExtremeContentProvider(v as typeof extremeContentProvider)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {extremeContentProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <p.icon className="size-3.5 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Extreme Content Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Retry with another provider when the primary one returns no content for a URL
              </p>
            </div>
            <Switch checked={extremeContentFallbackEnabled} onCheckedChange={setExtremeContentFallbackEnabled} />
          </div>
          {extremeContentFallbackEnabled && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Extreme Content Fallback Provider</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Which provider to retry with, per URL (skipped automatically when it matches your primary provider)
                </p>
              </div>
              <Select
                value={extremeContentFallbackProvider}
                onValueChange={(v) => setExtremeContentFallbackProvider(v as typeof extremeContentFallbackProvider)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {extremeContentProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <p.icon className="size-3.5 shrink-0" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Metadata Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use metadata scraping as a last resort (title + description only) when both content providers fail on
                a URL
              </p>
            </div>
            <Switch checked={fallbackMetadata} onCheckedChange={setFallbackMetadata} />
          </div>
        </div>
      </div>
      <div className="mt-4">
        {/* Vector Database */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="min-w-0">
              <p className="text-sm font-medium">Vector Database</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enable hybrid search via Qdrant — only applies to Web Search with the SearXNG provider
              </p>
            </div>
            <Switch id="qdrant-enabled" checked={qdrantEnabled ?? false} onCheckedChange={setQdrantEnabled} />
          </div>
        </div>

        {/* Hybrid Search */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-medium">Hybrid Search</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {qdrantEnabled
                ? 'Semantic fusion, content indexing, and reranking of search results'
                : 'Enable the vector database (Qdrant) to use these options'}
            </p>
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Search Embedding</p>
              <p className="text-xs text-muted-foreground mt-0.5">Embedding model for semantic search (Qdrant)</p>
            </div>
            <Switch checked={embeddingEnabled} onCheckedChange={setEmbeddingEnabled} disabled={!qdrantEnabled} />
          </div>

          {embeddingEnabled && (
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Embedding Model</p>
                <p className="text-xs text-muted-foreground mt-0.5">Select from your Custom AI Providers</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!selectedEmbeddingProvider && (
                  <span className="text-[11px] text-muted-foreground/70 shrink-0 max-w-[120px] truncate">
                    Default: nomic-embed-text
                  </span>
                )}
                <ModelSelectorDialog
                  selectedModel={selectedEmbeddingProvider}
                  onModelSelect={handleEmbeddingModelSelect}
                  user={user}
                  additionalModels={customModelsList}
                  onlyAdditionalModels
                  className="w-[180px] h-8"
                  compact
                />
                {selectedEmbeddingProvider && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    title="Reset to default"
                    onClick={() => handleEmbeddingModelSelect('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Semantic Fusion</p>
              <p className="text-xs text-muted-foreground mt-0.5">Combines SearXNG results with vector search (RRF)</p>
            </div>
            <Switch
              id="hybrid-search-enabled"
              checked={hybridSearchEnabled ?? false}
              onCheckedChange={setHybridSearchEnabled}
              disabled={!qdrantEnabled}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Content Indexing</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Extracts, chunks, and indexes page content into Qdrant
              </p>
            </div>
            <Switch
              id="content-indexing-enabled"
              checked={contentIndexingEnabled ?? false}
              onCheckedChange={setContentIndexingEnabled}
              disabled={!qdrantEnabled}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Reranking</p>
              <p className="text-xs text-muted-foreground mt-0.5">Reorders fused results using an LLM</p>
            </div>
            <Switch
              id="rerank-enabled"
              checked={rerankEnabled ?? false}
              onCheckedChange={setRerankEnabled}
              disabled={!qdrantEnabled}
            />
          </div>
        </div>

        {/* File Search Embedding */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-medium">File Search Embedding</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Embedding model used to index uploaded documents (file_query_search, extreme_search) — independent of the
              Vector Database setting above
            </p>
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fileEmbeddingProvider === 'custom'
                  ? 'Uses your selected Custom AI Provider'
                  : 'Cohere embed-v4.0 (requires COHERE_API_KEY)'}
              </p>
            </div>
            <Select
              value={fileEmbeddingProvider ?? 'cohere'}
              onValueChange={(v) => setFileEmbeddingProvider(v as 'cohere' | 'custom')}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cohere">Cohere</SelectItem>
                <SelectItem value="custom">Custom Provider</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {fileEmbeddingProvider === 'custom' && (
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Embedding Model</p>
                <p className="text-xs text-muted-foreground mt-0.5">Select from your Custom AI Providers</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!selectedEmbeddingProvider && (
                  <span className="text-[11px] text-muted-foreground/70 shrink-0 max-w-[120px] truncate">
                    Falls back to Cohere until set
                  </span>
                )}
                <ModelSelectorDialog
                  selectedModel={selectedEmbeddingProvider}
                  onModelSelect={handleEmbeddingModelSelect}
                  user={user}
                  additionalModels={customModelsList}
                  onlyAdditionalModels
                  className="w-[180px] h-8"
                  compact
                />
                {selectedEmbeddingProvider && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    title="Reset to default"
                    onClick={() => handleEmbeddingModelSelect('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
