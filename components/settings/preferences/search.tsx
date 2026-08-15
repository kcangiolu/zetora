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
import { searchProviders, type CustomProviderConfig, parseCustomModel } from './shared';

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

  const [extremeContentProvider, setExtremeContentProvider] = useSyncedPreferences<
    'exa-firecrawl' | 'searxng-fastcrw' | 'notte-only'
  >('zetora-extreme-content-provider', 'exa-firecrawl');

  const [fallbackFirecrawlContent, setFallbackFirecrawlContent] = useSyncedPreferences<boolean>(
    'zetora-fallback-firecrawl-content',
    true,
  );
  const [fallbackMetadata, setFallbackMetadata] = useSyncedPreferences<boolean>('zetora-fallback-metadata', true);
  const [fallbackNotte, setFallbackNotte] = useSyncedPreferences<boolean>('zetora-fallback-notte', true);
  const [fallbackExaBrowse, setFallbackExaBrowse] = useSyncedPreferences<boolean>('zetora-fallback-exa-browse', true);
  const [fallbackSearchFirecrawl, setFallbackSearchFirecrawl] = useSyncedPreferences<boolean>(
    'zetora-fallback-search-firecrawl',
    true,
  );
  const [fallbackRetrieveParallel, setFallbackRetrieveParallel] = useSyncedPreferences<boolean>(
    'zetora-fallback-retrieve-parallel',
    true,
  );
  const [fallbackRetrieveFirecrawl, setFallbackRetrieveFirecrawl] = useSyncedPreferences<boolean>(
    'zetora-fallback-retrieve-firecrawl',
    true,
  );
  const [fallbackRetrieveFastcrw, setFallbackRetrieveFastcrw] = useSyncedPreferences<boolean>(
    'zetora-fallback-retrieve-fastcrw',
    true,
  );
  const [fallbackRetrieveExa, setFallbackRetrieveExa] = useSyncedPreferences<boolean>(
    'zetora-fallback-retrieve-exa',
    true,
  );
  const [searchFallbackProvider, setSearchFallbackProvider] = useSyncedPreferences<
    'firecrawl' | 'exa' | 'parallel' | 'searxng' | 'fastcrw' | 'none'
  >('zetora-search-fallback-provider', 'firecrawl');

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
          {/* Search Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Search Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engine used for web searches</p>
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
              <p className="text-sm font-medium">Search Fallback</p>
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
          {/* Extreme Content Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Extreme Content Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Search + content extraction stack for Extreme Agent
              </p>
            </div>
            <Select
              value={extremeContentProvider}
              onValueChange={(v) => setExtremeContentProvider(v as 'exa-firecrawl' | 'searxng-fastcrw' | 'notte-only')}
            >
              <SelectTrigger className="w-[160px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exa-firecrawl">Exa + Firecrawl</SelectItem>
                <SelectItem value="searxng-fastcrw">SearXNG + fastCRW</SelectItem>
                <SelectItem value="notte-only">Notte only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Extreme Search Fallbacks */}
          {extremeContentProvider === 'exa-firecrawl' && (
            <>
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Firecrawl Content Fallback</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use Firecrawl when Exa fails to extract content from a page
                  </p>
                </div>
                <Switch checked={fallbackFirecrawlContent} onCheckedChange={setFallbackFirecrawlContent} />
              </div>
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Metadata Fallback</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use metadata scraping as a last resort (title + description only)
                  </p>
                </div>
                <Switch checked={fallbackMetadata} onCheckedChange={setFallbackMetadata} />
              </div>
            </>
          )}
          {(extremeContentProvider === 'searxng-fastcrw' || extremeContentProvider === 'notte-only') && (
            <>
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Notte Fallback</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Use Notte when fastCRW fails to scrape a page</p>
                </div>
                <Switch checked={fallbackNotte} onCheckedChange={setFallbackNotte} />
              </div>
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Metadata Fallback</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use metadata scraping as a last resort (title + description only)
                  </p>
                </div>
                <Switch checked={fallbackMetadata} onCheckedChange={setFallbackMetadata} />
              </div>
            </>
          )}
          {/* BrowsePage fallbacks (Extreme Search internal) */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Exa Browse Fallback</p>
              <p className="text-xs text-muted-foreground mt-0.5">Use Exa in the BrowsePage chain after Notte fails</p>
            </div>
            <Switch checked={fallbackExaBrowse} onCheckedChange={setFallbackExaBrowse} />
          </div>
        </div>
      </div>
      <div className="mt-4">
        {/* Vector Database */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="min-w-0">
              <p className="text-sm font-medium">Vector Database</p>
              <p className="text-xs text-muted-foreground mt-0.5">Enable hybrid search via Qdrant</p>
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

        {/* Retrieve Fallbacks */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-medium">Retrieve Fallbacks</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Methods tried in sequence to extract content from a URL — fastCRW → Exa → Parallel AI → Firecrawl. Turning
              all of these off means retrieve fails outright instead of falling through to a method you did not ask for.
            </p>
          </div>
          <div className="px-4 divide-y divide-border/40">
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">fastCRW</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Try your self-hosted fastCRW instance first (only applies if one is configured)
                </p>
              </div>
              <Switch checked={fallbackRetrieveFastcrw} onCheckedChange={setFallbackRetrieveFastcrw} />
            </div>
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Exa</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use Exa AI if fastCRW is disabled/unconfigured or returns no content
                </p>
              </div>
              <Switch checked={fallbackRetrieveExa} onCheckedChange={setFallbackRetrieveExa} />
            </div>
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Parallel AI</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use Parallel AI if Exa returns no content</p>
              </div>
              <Switch checked={fallbackRetrieveParallel} onCheckedChange={setFallbackRetrieveParallel} />
            </div>
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Firecrawl</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use Firecrawl as a last resort if Parallel AI also fails
                </p>
              </div>
              <Switch checked={fallbackRetrieveFirecrawl} onCheckedChange={setFallbackRetrieveFirecrawl} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
