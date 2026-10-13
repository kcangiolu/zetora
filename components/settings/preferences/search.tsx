'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelectorDialog } from '@/components/ui/model-selector';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { sileo } from 'sileo';
import { Search, X } from 'lucide-react';
import { SEARCH_PROVIDER_OPTIONS, type CustomProviderConfig, parseCustomModel } from './shared';
import { useInstanceCapabilities } from '@/hooks/use-instance-capabilities';
import type { PreferenceKey } from '@/hooks/use-synced-preferences';
import {
  pickFallbackSearchProvider,
  pickSearchProvider,
  searchProvidersFor,
  SEARCH_FUNCTION_PROVIDERS,
  type SearchFunction,
  type SearchProviderId,
} from '@/lib/search/providers';

function ProviderSelect({
  value,
  options,
  onChange,
}: {
  value: SearchProviderId;
  options: SearchProviderId[];
  onChange: (value: SearchProviderId) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SearchProviderId)}>
      <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((id) => {
          const { label, icon: Icon } = SEARCH_PROVIDER_OPTIONS[id];
          return (
            <SelectItem key={id} value={id}>
              <div className="flex items-center gap-2">
                <Icon className="size-3.5 shrink-0" />
                <span>{label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// One search function's provider, plus its optional fallback (off by
// default). Only the providers this instance has are offered; with none, the
// row says what the instance needs instead.
function SearchProviderSetting({
  fn,
  title,
  description,
  providerKey,
  fallbackEnabledKey,
  fallbackProviderKey,
  available,
  emptyResult = 'results',
  onProviderChange,
}: {
  fn: SearchFunction;
  title: string;
  description: string;
  providerKey: PreferenceKey;
  fallbackEnabledKey: PreferenceKey;
  fallbackProviderKey: PreferenceKey;
  available: readonly SearchProviderId[];
  emptyResult?: 'results' | 'content';
  onProviderChange?: (provider: SearchProviderId) => void;
}) {
  const [preferred, setPreferred] = useSyncedPreferences<string>(providerKey, '');
  const [fallbackEnabled, setFallbackEnabled] = useSyncedPreferences<boolean>(fallbackEnabledKey, false);
  const [fallbackPreferred, setFallbackPreferred] = useSyncedPreferences<string>(fallbackProviderKey, '');

  const options = searchProvidersFor(fn, available);
  const provider = pickSearchProvider(fn, preferred, available);

  if (!provider) {
    const requirements = SEARCH_FUNCTION_PROVIDERS[fn].map((id) => SEARCH_PROVIDER_OPTIONS[id].requirement);
    return (
      <div className="py-3.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
          Unavailable: this instance needs {requirements.slice(0, -1).join(', ')} or {requirements.at(-1)}
        </p>
      </div>
    );
  }

  const fallbackOptions = options.filter((id) => id !== provider);
  const fallbackProvider = pickFallbackSearchProvider(fn, fallbackPreferred, provider, available);

  return (
    <>
      <div className="flex items-center justify-between py-3.5 gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title} Provider</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <ProviderSelect
          value={provider}
          options={options}
          onChange={(id) => {
            setPreferred(id);
            onProviderChange?.(id);
          }}
        />
      </div>
      {fallbackProvider && (
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">{title} Fallback</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Retry with another provider when the primary one returns no {emptyResult}
            </p>
          </div>
          <Switch checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
        </div>
      )}
      {fallbackProvider && fallbackEnabled && (
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">{title} Fallback Provider</p>
            <p className="text-xs text-muted-foreground mt-0.5">Which provider to retry with</p>
          </div>
          <ProviderSelect value={fallbackProvider} options={fallbackOptions} onChange={setFallbackPreferred} />
        </div>
      )}
    </>
  );
}

export function SearchTab({ customProviders }: { customProviders: CustomProviderConfig[] }) {
  const capabilities = useInstanceCapabilities();
  const availableProviders = capabilities?.searchProviders ?? [];
  const [fallbackMetadata, setFallbackMetadata] = useSyncedPreferences<boolean>('zetora-fallback-metadata', true);

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

  const announceSearchProviderChange = (provider: SearchProviderId) => {
    sileo.success({
      title: `Search provider changed to ${SEARCH_PROVIDER_OPTIONS[provider].label}`,
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
      {capabilities && (
        <>
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              <SearchProviderSetting
                fn="web"
                title="Web Search"
                description="Engine used for general web searches"
                providerKey="zetora-search-provider"
                fallbackEnabledKey="zetora-fallback-search-firecrawl"
                fallbackProviderKey="zetora-search-fallback-provider"
                available={availableProviders}
                onProviderChange={announceSearchProviderChange}
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              <SearchProviderSetting
                fn="github"
                title="GitHub Search"
                description="Engine used for the GitHub search tool"
                providerKey="zetora-github-search-provider"
                fallbackEnabledKey="zetora-github-search-fallback-enabled"
                fallbackProviderKey="zetora-github-search-fallback-provider"
                available={availableProviders}
              />
              <SearchProviderSetting
                fn="academic"
                title="Academic Search"
                description="Engine used for the academic search tool"
                providerKey="zetora-academic-search-provider"
                fallbackEnabledKey="zetora-academic-search-fallback-enabled"
                fallbackProviderKey="zetora-academic-search-fallback-provider"
                available={availableProviders}
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              <SearchProviderSetting
                fn="retrieve"
                title="Retrieve"
                description="Engine used to extract content from a URL the user shares directly"
                providerKey="zetora-retrieve-provider"
                fallbackEnabledKey="zetora-retrieve-fallback-enabled"
                fallbackProviderKey="zetora-retrieve-fallback-provider"
                available={availableProviders}
                emptyResult="content"
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              <SearchProviderSetting
                fn="reddit"
                title="Reddit Search"
                description="Engine used for the Reddit search tool"
                providerKey="zetora-reddit-search-provider"
                fallbackEnabledKey="zetora-reddit-search-fallback-enabled"
                fallbackProviderKey="zetora-reddit-search-fallback-provider"
                available={availableProviders}
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              <SearchProviderSetting
                fn="extremeSearch"
                title="Extreme Search"
                description="Engine used to find URLs for Extreme Agent"
                providerKey="zetora-extreme-search-provider"
                fallbackEnabledKey="zetora-extreme-search-fallback-enabled"
                fallbackProviderKey="zetora-extreme-search-fallback-provider"
                available={availableProviders}
              />
              <SearchProviderSetting
                fn="extremeContent"
                title="Extreme Content"
                description="Engine used to extract content from found URLs (also used by BrowsePage)"
                providerKey="zetora-extreme-content-provider"
                fallbackEnabledKey="zetora-extreme-content-fallback-enabled"
                fallbackProviderKey="zetora-extreme-content-fallback-provider"
                available={availableProviders}
                emptyResult="content"
              />
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Metadata Fallback</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use metadata scraping as a last resort (title + description only) when both content providers fail
                    on a URL
                  </p>
                </div>
                <Switch checked={fallbackMetadata} onCheckedChange={setFallbackMetadata} />
              </div>
            </div>
          </div>
        </>
      )}
      <div className="mt-4">
        {capabilities?.hybridSearch && (
          <>
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
                      source="custom"
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
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Combines SearXNG results with vector search (RRF)
                  </p>
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
          </>
        )}

        {/* File Search Embedding */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-medium">File Search Embedding</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Embedding model used to index uploaded documents (file_query_search, extreme_search) — independent of
              Hybrid Search
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
                  source="custom"
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
