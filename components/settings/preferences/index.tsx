'use client';

import type { SettingsUser } from '../shared';
import { Button } from '@/components/ui/button';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { Textarea } from '@/components/ui/textarea';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { all } from 'better-all';
import { TrashIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { X, Save } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Model } from '@/ai/models';
import { Switch } from '@/components/ui/switch';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ModelSelectorDialog } from '@/components/ui/model-selector';
import { Loader2, Search, Zap, ZapOff, Plus, HardDrive, Timer, Shield, ShieldOff } from 'lucide-react';
import {
  searchProviders,
  storageProviders,
  lockoutProviders,
  memoryProviders,
  emailProviders,
  type CustomProviderConfig,
  type AutoRouterRoute,
  type AutoRouterConfig,
  getDefaultAutoRouterRoutes,
  TertiaryModelRow,
  EmailTestButton,
} from './shared';
import { CustomizeTab } from './customize';
import { GeneralTab } from './general';
import { VoiceTab } from './voice';

export function PreferencesSection({
  user,
  isCustomInstructionsEnabled,
  setIsCustomInstructionsEnabledAction,
}: {
  user: SettingsUser;
  isCustomInstructionsEnabled?: boolean;
  setIsCustomInstructionsEnabledAction?: (value: boolean | ((val: boolean) => boolean)) => void;
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

  const [sandboxProvider, setSandboxProvider] = useSyncedPreferences<'daytona' | 'docker'>(
    'zetora-sandbox-provider',
    'daytona',
  );

  const [storageProvider, setStorageProvider] = useSyncedPreferences<'cloudflare-r2' | 'minio'>(
    'zetora-storage-provider',
    'cloudflare-r2',
  );

  const [emailProvider, setEmailProvider] = useSyncedPreferences<'resend' | 'smtp'>('zetora-email-provider', 'resend');

  const [lockoutProvider, setLockoutProvider] = useSyncedPreferences<'qstash' | 'bullmq'>(
    'zetora-lockout-provider',
    'qstash',
  );

  const [memoryProvider, setMemoryProvider] = useSyncedPreferences<'supermemory' | 'graphiti'>(
    'zetora-memory-provider',
    'supermemory',
  );
  const [selectedGraphitiProvider, setSelectedGraphitiProvider] = useSyncedPreferences<string>(
    'zetora-graphiti-active-provider',
    '',
  );
  const [graphitiLlmModel, setGraphitiLlmModel] = useSyncedPreferences<string>('zetora-graphiti-llm-model', '');
  const [, setGraphitiLlmBaseUrl] = useSyncedPreferences<string>('zetora-graphiti-llm-base-url', '');
  const [graphitiEmbeddingProvider, setGraphitiEmbeddingProvider] = useSyncedPreferences<string>(
    'zetora-graphiti-embedding-provider',
    '',
  );
  const [, setGraphitiEmbeddingModel] = useSyncedPreferences<string>('zetora-graphiti-embedding-model', '');
  const [graphitiChunkSize, setGraphitiChunkSize] = useSyncedPreferences<number>('zetora-graphiti-chunk-size', 8000);
  const [graphitiMaxRetries, setGraphitiMaxRetries] = useSyncedPreferences<number>('zetora-graphiti-max-retries', 2);
  const [graphitiChunkDelayMs, setGraphitiChunkDelayMs] = useSyncedPreferences<number>(
    'zetora-graphiti-chunk-delay-ms',
    2000,
  );

  const [xqlEnabled, setXqlEnabled] = useSyncedPreferences<boolean>('zetora-xql-enabled', true);
  const [lookoutEnabled, setLookoutEnabled] = useSyncedPreferences<boolean>('zetora-lookout-enabled', true);
  const [voiceEnabled, setVoiceEnabled] = useSyncedPreferences<boolean>('zetora-voice-enabled', true);
  const [appsEnabled, setAppsEnabled] = useSyncedPreferences<boolean>('zetora-apps-enabled', true);
  const [autoRouterEnabled, setAutoRouterEnabled] = useSyncedPreferences<boolean>('zetora-auto-router-enabled', false);
  const [autoRouterConfig, setAutoRouterConfig] = useSyncedPreferences<AutoRouterConfig>('zetora-auto-router-config', {
    routes: getDefaultAutoRouterRoutes(),
  });

  const [embeddingEnabled, setEmbeddingEnabled] = useSyncedPreferences<boolean>('zetora-embedding-enabled', false);
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useSyncedPreferences<string>(
    'zetora-embedding-provider',
    '',
  );
  const [embeddingModel, setEmbeddingModel] = useSyncedPreferences<string>(
    'zetora-embedding-model',
    'nomic-embed-text',
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

  const [xmlToolParsingEnabled, setXmlToolParsingEnabled] = useSyncedPreferences<boolean>(
    'zetora-xml-tool-parsing-enabled',
    false,
  );

  const queryClient = useQueryClient();

  // Fetch custom models for the tertiary model selectors
  const { data: customModelsData } = useQuery({
    queryKey: ['customModels'],
    queryFn: async () => {
      const res = await fetch('/api/custom-providers/models');
      if (!res.ok) return { models: [] };
      return res.json() as Promise<{ models: Model[] }>;
    },
    staleTime: 60_000,
  });
  const customModelsList: Model[] = customModelsData?.models ?? [];

  // Custom AI Providers state
  const [customProviders, setCustomProviders] = useState<CustomProviderConfig[]>([]);
  const [showCustomProviderForm, setShowCustomProviderForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: '', baseURL: '', apiKey: '' });
  const [detectingModels, setDetectingModels] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [isSavingProvider, setIsSavingProvider] = useState(false);

  useEffect(() => {
    fetch('/api/custom-providers')
      .then((r) => r.json())
      .then((d) => setCustomProviders(d.providers || []))
      .catch(() => {});
  }, []);

  const handleDetectModels = async () => {
    if (!newProvider.baseURL) return;
    setDetectingModels(true);
    try {
      const res = await fetch('/api/custom-providers/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL: newProvider.baseURL, apiKey: newProvider.apiKey || undefined }),
      });
      const data = await res.json();
      setDetectedModels(data.models || []);
    } catch (e) {
      sileo.error({ title: 'Detection failed', description: String(e) });
    } finally {
      setDetectingModels(false);
    }
  };

  const handleSaveProvider = async () => {
    if (!newProvider.name || !newProvider.baseURL) {
      sileo.error({ title: 'Name and Base URL are required' });
      return;
    }
    setIsSavingProvider(true);
    try {
      const id = newProvider.name.toLowerCase().replace(/\s+/g, '-');
      const updated = [...customProviders.filter((p) => p.id !== id), { id, ...newProvider }];
      const res = await fetch('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: updated }),
      });
      if (!res.ok) throw new Error('Save failed');
      setCustomProviders(updated);
      setNewProvider({ name: '', baseURL: '', apiKey: '' });
      setDetectedModels([]);
      setShowCustomProviderForm(false);
      queryClient.invalidateQueries({ queryKey: ['customModels'] });
      sileo.success({ title: 'Provider saved', description: newProvider.name });
    } catch (e) {
      sileo.error({ title: 'Failed to save provider', description: String(e) });
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleRemoveProvider = async (id: string) => {
    const updated = customProviders.filter((p) => p.id !== id);
    try {
      await fetch('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: updated }),
      });
      setCustomProviders(updated);
      queryClient.invalidateQueries({ queryKey: ['customModels'] });
    } catch {
      sileo.error({ title: 'Failed to remove provider' });
    }
  };

  const handleToggleAutoDetect = async (id: string) => {
    const updated = customProviders.map((p) => (p.id === id ? { ...p, disableAutoDetect: !p.disableAutoDetect } : p));
    try {
      await fetch('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: updated }),
      });
      setCustomProviders(updated);
      queryClient.invalidateQueries({ queryKey: ['customModels'] });
    } catch {
      sileo.error({ title: 'Failed to update provider' });
    }
  };

  const handleToggleAnonymize = async (id: string) => {
    const updated = customProviders.map((p) => (p.id === id ? { ...p, anonymize: !p.anonymize } : p));
    try {
      await fetch('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: updated }),
      });
      setCustomProviders(updated);
      queryClient.invalidateQueries({ queryKey: ['customModels'] });
    } catch {
      sileo.error({ title: 'Failed to update provider' });
    }
  };

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

  const handleStorageProviderChange = (newProvider: 'cloudflare-r2' | 'minio') => {
    setStorageProvider(newProvider);
    sileo.success({
      title: `Storage provider changed to ${newProvider === 'cloudflare-r2' ? 'Cloudflare R2' : 'MinIO'}`,
      description: 'This will be used for all file uploads and artifact storage',
      icon: <HardDrive className="h-4 w-4" />,
    });
  };

  const handleLockoutProviderChange = (newProvider: 'qstash' | 'bullmq') => {
    setLockoutProvider(newProvider);
    const label = lockoutProviders.find((p) => p.value === newProvider)?.label ?? newProvider;
    sileo.success({
      title: `Lookout scheduler changed to ${label}`,
      description: 'This will be used for all future scheduled searches',
      icon: <Timer className="h-4 w-4" />,
    });
  };

  function parseCustomModel(modelId: string) {
    if (!modelId.startsWith('custom-')) return null;
    const withoutPrefix = modelId.slice('custom-'.length);
    for (const provider of customProviders) {
      if (withoutPrefix.startsWith(`${provider.id}-`)) {
        return { modelName: withoutPrefix.slice(`${provider.id}-`.length), provider };
      }
    }
    return null;
  }

  const handleEmbeddingModelSelect = (modelId: string) => {
    setSelectedEmbeddingProvider(modelId);
    if (modelId) {
      const parsed = parseCustomModel(modelId);
      if (parsed) setEmbeddingModel(parsed.modelName);
    } else {
      setEmbeddingModel('nomic-embed-text');
    }
  };

  // The provider's API key is decrypted server-side and forwarded straight to
  // Graphiti by /api/graphiti/link-provider — it never touches the browser.
  const linkGraphitiProvider = async (providerId: string, target: 'llm' | 'embedding', modelName: string) => {
    try {
      const res = await fetch('/api/graphiti/link-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, target, modelName }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      sileo.error({ title: 'Could not configure Graphiti service' });
    }
  };

  const handleGraphitiLlmSelect = async (modelId: string) => {
    setSelectedGraphitiProvider(modelId);
    if (modelId) {
      const parsed = parseCustomModel(modelId);
      if (parsed) {
        setGraphitiLlmModel(parsed.modelName);
        setGraphitiLlmBaseUrl(parsed.provider.baseURL);
        await linkGraphitiProvider(parsed.provider.id, 'llm', parsed.modelName);
      }
    } else {
      setGraphitiLlmModel('');
      setGraphitiLlmBaseUrl('');
    }
  };

  const handleGraphitiEmbeddingSelect = async (modelId: string) => {
    setGraphitiEmbeddingProvider(modelId);
    if (modelId) {
      const parsed = parseCustomModel(modelId);
      if (parsed) {
        setGraphitiEmbeddingModel(parsed.modelName);
        await linkGraphitiProvider(parsed.provider.id, 'embedding', parsed.modelName);
      }
    } else {
      setGraphitiEmbeddingModel('');
    }
  };

  const handleMemoryProviderChange = (newProvider: 'supermemory' | 'graphiti') => {
    setMemoryProvider(newProvider);
    const label = memoryProviders.find((p) => p.value === newProvider)?.label ?? newProvider;
    sileo.success({
      title: `Memory provider changed to ${label}`,
      description: 'This will be used for all future memory operations',
    });
  };

  const [preferencesTab, setPreferencesTab] = useState<
    'general' | 'search' | 'ai-models' | 'voice' | 'integrations' | 'customize'
  >('general');
  const isMaxUser = Boolean(user?.isMaxUser);
  const hasPaidAccess = Boolean(user?.isProUser || user?.isMaxUser);

  const updateAutoRouterRoute = useCallback(
    (index: number, update: Partial<AutoRouterRoute>) => {
      setAutoRouterConfig((current: AutoRouterConfig) => {
        const nextRoutes = [...(current?.routes || [])];
        nextRoutes[index] = {
          ...(nextRoutes[index] || { name: '', description: '', model: 'zetora-default' }),
          ...update,
        };
        return { routes: nextRoutes };
      });
    },
    [setAutoRouterConfig],
  );

  const addAutoRouterRoute = useCallback(() => {
    setAutoRouterConfig((current: AutoRouterConfig) => ({
      routes: [...(current?.routes || []), { name: '', description: '', model: 'zetora-default' }],
    }));
  }, [setAutoRouterConfig]);

  const removeAutoRouterRoute = useCallback(
    (index: number) => {
      setAutoRouterConfig((current: AutoRouterConfig) => ({
        routes: (current?.routes || []).filter((_: AutoRouterRoute, routeIndex: number) => routeIndex !== index),
      }));
    },
    [setAutoRouterConfig],
  );

  return (
    <div>
      <div>
        <KumoTabs
          variant="segmented"
          value={preferencesTab}
          onValueChange={(v) =>
            setPreferencesTab(v as 'general' | 'search' | 'ai-models' | 'voice' | 'integrations' | 'customize')
          }
          className="w-full [--color-kumo-tint:var(--accent)] [--color-kumo-base:var(--background)] [--color-kumo-recessed:var(--muted)] [--color-kumo-surface:var(--card)] [--text-color-kumo-default:var(--foreground)] [--text-color-kumo-strong:var(--muted-foreground)] [--text-color-kumo-subtle:var(--muted-foreground)] [--color-kumo-ring:var(--border)]"
          listClassName="w-full overflow-x-auto [&>button]:shrink-0 [&>button]:justify-center md:[&>button]:flex-1"
          tabs={[
            { value: 'general', label: 'General' },
            { value: 'search', label: 'Search' },
            { value: 'ai-models', label: 'AI Models' },
            { value: 'voice', label: 'Voice & Media' },
            { value: 'integrations', label: 'Integrations' },
            { value: 'customize', label: 'Customize' },
          ]}
        />

        {/* ── General tab ── */}
        {preferencesTab === 'general' && (
          <GeneralTab
            user={user}
            isCustomInstructionsEnabled={isCustomInstructionsEnabled}
            setIsCustomInstructionsEnabledAction={setIsCustomInstructionsEnabledAction}
          />
        )}

        {/* ── Search & Retrieval tab ── */}
        {preferencesTab === 'search' && (
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
        )}

        {/* ── Integrations tab ── */}
        {preferencesTab === 'integrations' && (
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              {/* Sandbox Provider */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Sandbox Provider</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Environment used to execute Python code</p>
                </div>
                <Select value={sandboxProvider} onValueChange={(v) => setSandboxProvider(v as 'daytona' | 'docker')}>
                  <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daytona">Daytona (Cloud)</SelectItem>
                    <SelectItem value="docker">Docker (Local)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Storage Provider */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Storage Provider</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Object storage for uploads and artifacts</p>
                </div>
                <Select value={storageProvider} onValueChange={(v) => handleStorageProviderChange(v as any)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storageProviders.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div className="flex items-center gap-2">
                          <span>{p.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {preferencesTab === 'search' && (
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
                  onValueChange={(v) =>
                    setExtremeContentProvider(v as 'exa-firecrawl' | 'searxng-fastcrw' | 'notte-only')
                  }
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
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Use Notte when fastCRW fails to scrape a page
                      </p>
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
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use Exa in the BrowsePage chain after Notte fails
                  </p>
                </div>
                <Switch checked={fallbackExaBrowse} onCheckedChange={setFallbackExaBrowse} />
              </div>
            </div>
          </div>
        )}

        {preferencesTab === 'integrations' && (
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              {/* Lookout Scheduling Provider */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Lookout Scheduler</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Scheduling backend for automated searches</p>
                </div>
                <Select
                  value={lockoutProvider}
                  onValueChange={(v) => handleLockoutProviderChange(v as 'qstash' | 'bullmq')}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lockoutProviders.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span>{p.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Email Provider */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Email Provider</p>
                  <p className="text-xs text-muted-foreground mt-0.5">How lookout completion emails are sent</p>
                </div>
                <Select value={emailProvider} onValueChange={(v) => setEmailProvider(v as 'resend' | 'smtp')}>
                  <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {emailProviders.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span>{p.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="py-3.5">
                <EmailTestButton />
              </div>

              {/* Memory Provider */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Memory Provider</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Backend for long-term memory storage</p>
                </div>
                <Select
                  value={memoryProvider}
                  onValueChange={(v) => handleMemoryProviderChange(v as 'supermemory' | 'graphiti')}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {memoryProviders.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* ── Voice & Media tab ── */}
        {preferencesTab === 'voice' && <VoiceTab customProviders={customProviders} />}

        {/* ── AI Models tab ── */}
        {preferencesTab === 'ai-models' && (
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              {/* Auto Router toggle (Pro only) */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Auto Model Router</p>
                    {!hasPaidAccess && (
                      <span className="font-pixel text-xs text-muted-foreground/50 uppercase tracking-wider">Pro</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Route queries to the best model based on intent
                  </p>
                </div>
                <Switch
                  id="auto-router-enabled"
                  checked={hasPaidAccess ? autoRouterEnabled : false}
                  onCheckedChange={(value) => {
                    if (!hasPaidAccess) return;
                    setAutoRouterEnabled(value);
                  }}
                  disabled={!hasPaidAccess}
                />
              </div>

              {/* Auto Router routes - inline expand (paid + enabled only) */}
              {hasPaidAccess && autoRouterEnabled && (
                <div className="py-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Routes</p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] px-2 rounded-md"
                        onClick={() => setAutoRouterConfig({ routes: getDefaultAutoRouterRoutes() })}
                      >
                        Reset
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2 rounded-md"
                        onClick={addAutoRouterRoute}
                      >
                        + Add
                      </Button>
                    </div>
                  </div>
                  {(autoRouterConfig?.routes || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 py-2">No routes configured.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(autoRouterConfig?.routes || []).map((route: AutoRouterRoute, index: number) => (
                        <div key={index} className="rounded-lg border border-border/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] text-muted-foreground/50">Route {index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground hover:text-destructive"
                              onClick={() => removeAutoRouterRoute(index)}
                            >
                              <TrashIcon className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <Input
                              value={route.name}
                              onChange={(e) => updateAutoRouterRoute(index, { name: e.target.value })}
                              placeholder="Name"
                              className="h-7 text-xs rounded-md"
                            />
                            <ModelSelectorDialog
                              selectedModel={route.model}
                              onModelSelect={(v) => updateAutoRouterRoute(index, { model: v })}
                              user={user}
                              isProUser={hasPaidAccess}
                              isMaxUser={isMaxUser}
                              excludeModels={['zetora-auto']}
                              additionalModels={customModelsList}
                              className="w-full h-7"
                              compact
                            />
                          </div>
                          <Textarea
                            value={route.description}
                            onChange={(e) => updateAutoRouterRoute(index, { description: e.target.value })}
                            placeholder="Intent description"
                            className="min-h-[40px] text-xs resize-none rounded-md"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {preferencesTab === 'integrations' && (
          <div className="mt-4">
            {/* Tools */}
            <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-sm font-medium">Tools</p>
                <p className="text-xs text-muted-foreground mt-0.5">Show or hide tool shortcuts in the sidebar</p>
              </div>

              <div className="flex items-center justify-between px-4 py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Lookout</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Show the Lookout shortcut in the sidebar</p>
                </div>
                <Switch id="lookout-enabled" checked={lookoutEnabled} onCheckedChange={setLookoutEnabled} />
              </div>

              <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">XQL (Beta)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Show the X/Twitter search shortcut in the sidebar
                  </p>
                </div>
                <Switch id="xql-enabled" checked={xqlEnabled} onCheckedChange={setXqlEnabled} />
              </div>

              <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Voice</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Show the Voice shortcut in the sidebar</p>
                </div>
                <Switch id="voice-enabled" checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
              </div>

              <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Apps</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Show the Apps shortcut in the sidebar</p>
                </div>
                <Switch id="apps-enabled" checked={appsEnabled} onCheckedChange={setAppsEnabled} />
              </div>
            </div>

            {/* Graphiti Services */}
            <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-sm font-medium">Graphiti Services</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Self-hosted Graphiti instances (temporal knowledge graph)
                </p>
              </div>

              {/* LLM Extractor */}
              <div className="flex items-center justify-between px-4 py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">LLM Extractor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Model used for entity extraction</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!selectedGraphitiProvider && (
                    <span className="text-[11px] text-muted-foreground/70 shrink-0">Not set</span>
                  )}
                  <ModelSelectorDialog
                    selectedModel={selectedGraphitiProvider}
                    onModelSelect={handleGraphitiLlmSelect}
                    user={user}
                    isProUser={hasPaidAccess}
                    isMaxUser={isMaxUser}
                    additionalModels={customModelsList}
                    onlyAdditionalModels
                    className="w-[180px] h-8"
                    compact
                  />
                  {selectedGraphitiProvider && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleGraphitiLlmSelect('')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Embedding */}
              <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Embedding</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Model used for vector embeddings</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!graphitiEmbeddingProvider && (
                    <span className="text-[11px] text-muted-foreground/70 shrink-0">Not set</span>
                  )}
                  <ModelSelectorDialog
                    selectedModel={graphitiEmbeddingProvider}
                    onModelSelect={handleGraphitiEmbeddingSelect}
                    user={user}
                    isProUser={hasPaidAccess}
                    isMaxUser={isMaxUser}
                    additionalModels={customModelsList}
                    onlyAdditionalModels
                    className="w-[180px] h-8"
                    compact
                  />
                  {graphitiEmbeddingProvider && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleGraphitiEmbeddingSelect('')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Episode Chunk Size */}
              <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Episode chunk size (characters)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Maximum characters per chunk sent to Graphiti. Lower values prevent &quot;LLM returned an empty
                    response&quot; errors on models with small context windows. Recommended: 8000 for 16k context
                    models.
                  </p>
                </div>
                <Input
                  type="number"
                  min={1000}
                  max={32000}
                  step={1000}
                  value={graphitiChunkSize ?? 8000}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isNaN(value)) return;
                    setGraphitiChunkSize(Math.min(32000, Math.max(1000, value)));
                  }}
                  className="h-8 w-24 text-xs rounded-lg shrink-0"
                />
              </div>

              {/* Max Ingestion Retries */}
              <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Max ingestion retries</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Number of retry attempts when Graphiti ingestion fails. Set to 0 to disable retries.
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  value={graphitiMaxRetries ?? 2}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isNaN(value)) return;
                    setGraphitiMaxRetries(Math.min(5, Math.max(0, value)));
                  }}
                  className="h-8 w-24 text-xs rounded-lg shrink-0"
                />
              </div>

              {/* Chunk Delay */}
              <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Delay between chunks (ms)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pause between each chunk sent to Graphiti. Increase to 4000-5000 if you still see &quot;Expecting
                    value&quot; errors.
                  </p>
                </div>
                <Input
                  type="number"
                  min={500}
                  max={10000}
                  step={500}
                  value={graphitiChunkDelayMs ?? 2000}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isNaN(value)) return;
                    setGraphitiChunkDelayMs(Math.min(10000, Math.max(500, value)));
                  }}
                  className="h-8 w-24 text-xs rounded-lg shrink-0"
                />
              </div>
            </div>
          </div>
        )}

        {preferencesTab === 'search' && (
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
                      isProUser={hasPaidAccess}
                      isMaxUser={isMaxUser}
                      additionalModels={customModelsList}
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

            {/* Retrieve Fallbacks */}
            <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-sm font-medium">Retrieve Fallbacks</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Methods tried in sequence to extract content from a URL — fastCRW → Exa → Parallel AI → Firecrawl.
                  Turning all of these off means retrieve fails outright instead of falling through to a method you did
                  not ask for.
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
        )}

        {preferencesTab === 'ai-models' && (
          <div className="mt-4">
            {/* Custom AI Providers */}
            <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Custom AI Providers</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Connect local models (Ollama, llama.cpp, etc.)</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs rounded-lg px-2.5 shrink-0"
                  onClick={() => setShowCustomProviderForm((v) => !v)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>

              {/* Existing providers list */}
              {customProviders.length > 0 && (
                <div className="divide-y divide-border/40">
                  {customProviders.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] text-green-500">●</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground/60 truncate">{p.baseURL}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title={
                            p.anonymize
                              ? 'Anonymization on — PII is masked before requests reach this provider'
                              : 'Anonymization off — click to enable if this provider is a cloud endpoint'
                          }
                          onClick={() => handleToggleAnonymize(p.id)}
                        >
                          {p.anonymize ? <Shield className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title={
                            p.disableAutoDetect
                              ? 'Auto-detect disabled — click to enable'
                              : 'Auto-detect enabled — click to disable'
                          }
                          onClick={() => handleToggleAutoDetect(p.id)}
                        >
                          {p.disableAutoDetect ? <ZapOff className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveProvider(p.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add provider form */}
              {showCustomProviderForm && (
                <div className="px-4 py-3 space-y-2.5 border-t border-border/40">
                  <Input
                    placeholder="Name (e.g. Ollama self-hosted)"
                    value={newProvider.name}
                    onChange={(e) => setNewProvider((v) => ({ ...v, name: e.target.value }))}
                    className="h-8 text-xs rounded-lg"
                  />
                  <Input
                    placeholder="Base URL (e.g. http://localhost:11434/v1)"
                    value={newProvider.baseURL}
                    onChange={(e) => setNewProvider((v) => ({ ...v, baseURL: e.target.value }))}
                    className="h-8 text-xs rounded-lg"
                  />
                  <Input
                    placeholder="API Key (optional)"
                    value={newProvider.apiKey}
                    onChange={(e) => setNewProvider((v) => ({ ...v, apiKey: e.target.value }))}
                    className="h-8 text-xs rounded-lg"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs rounded-lg px-2.5"
                      onClick={handleDetectModels}
                      disabled={detectingModels || !newProvider.baseURL}
                    >
                      {detectingModels ? (
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3 mr-1.5" />
                      )}
                      Detect Models
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs rounded-lg px-2.5"
                      onClick={handleSaveProvider}
                      disabled={isSavingProvider || !newProvider.name || !newProvider.baseURL}
                    >
                      {isSavingProvider ? (
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      ) : (
                        <FloppyDiskIcon className="h-3 w-3 mr-1.5" />
                      )}
                      Save Provider
                    </Button>
                  </div>
                  {detectedModels.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium">Detected:</span> {detectedModels.join(', ')}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">XML Tool Call Parsing</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enable XML tool call parsing for custom providers (Ollama, llama.cpp, vLLM, OpenRouter). Required
                    for models like Qwen, Hermes, GLM, and DeepSeek that output tool calls as text instead of
                    OpenAI-compatible JSON. The format is detected automatically (Morph XML, Qwen3-Coder, and Hermes
                    JSON).
                  </p>
                </div>
                <Switch
                  id="xml-tool-parsing-enabled"
                  checked={xmlToolParsingEnabled ?? false}
                  onCheckedChange={setXmlToolParsingEnabled}
                />
              </div>
            </div>

            {/* Tertiary Models */}
            <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-sm font-medium">Tertiary Models</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose which model to use for each background task
                </p>
              </div>
              <div className="divide-y divide-border/40 px-4">
                <TertiaryModelRow
                  modelKey="zetora-default-model"
                  providerKey="zetora-default-provider"
                  label="Default Model"
                  description="Fallback model used by Lookout and other tasks"
                  defaultModelLabel="Grok 4.1 Fast"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-chat-title-model"
                  providerKey="zetora-tertiary-chat-title-provider"
                  label="Chat Title"
                  description="Generates titles for new chats"
                  defaultModelLabel="Gemini 3.1 Flash Lite"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-followup-model"
                  providerKey="zetora-tertiary-followup-provider"
                  label="Follow-up Questions"
                  description="Generates questions after each response"
                  defaultModelLabel="Gemini 3.1 Flash Lite"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-enhance-model"
                  providerKey="zetora-tertiary-enhance-provider"
                  label="Prompt Enhancement"
                  description="Rewrites prompts (Enhance button)"
                  defaultModelLabel="Kimi K2"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-tool-repair-model"
                  providerKey="zetora-tertiary-tool-repair-provider"
                  label="Tool Call Repair"
                  description="Fixes malformed tool call arguments"
                  defaultModelLabel="Grok 4.1 Fast"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-auto-router-model"
                  providerKey="zetora-tertiary-auto-router-provider"
                  label="Auto Router"
                  description="Classifies queries for model routing"
                  defaultModelLabel="Arch-Router 1.5B"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-translate-text-model"
                  providerKey="zetora-tertiary-translate-text-provider"
                  label="Text Translation"
                  description="Translates text between languages"
                  defaultModelLabel="Gemini 3 Flash"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-translate-vision-model"
                  providerKey="zetora-tertiary-translate-vision-provider"
                  label="Vision Translation"
                  description="Extracts and translates text from images"
                  defaultModelLabel="Gemini 3 Flash"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-lang-detect-model"
                  providerKey="zetora-tertiary-lang-detect-provider"
                  label="Language Detection"
                  description="Detects language of input text"
                  defaultModelLabel="Grok 4.1 Fast"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-extreme-planner-model"
                  providerKey="zetora-tertiary-extreme-planner-provider"
                  label="Extreme Search Planner"
                  description="Generates research plans in Extreme mode"
                  defaultModelLabel="Grok 4.1 Fast (Reasoning)"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-extreme-agent-model"
                  providerKey="zetora-tertiary-extreme-agent-provider"
                  label="Extreme Search Agent"
                  description="Executes the autonomous research loop"
                  defaultModelLabel="Grok 4.1 Fast (Reasoning)"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
                <TertiaryModelRow
                  modelKey="zetora-tertiary-voice-model"
                  providerKey="zetora-tertiary-voice-provider"
                  label="Voice (Local Backend)"
                  description="LLM used by the local speech-to-speech backend"
                  defaultModelLabel="Grok 4.1 Fast"
                  additionalModels={customModelsList}
                  user={user}
                  isProUser={hasPaidAccess}
                  isMaxUser={isMaxUser}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Customize tab ── */}
        {preferencesTab === 'customize' && <CustomizeTab />}
      </div>
    </div>
  );
}
