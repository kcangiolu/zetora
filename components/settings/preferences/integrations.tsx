'use client';

import type { SettingsUser } from '../shared';
import { ExtensionSlot } from '@/components/extension-slot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelectorDialog } from '@/components/ui/model-selector';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { type Model } from '@/ai/models';
import { sileo } from 'sileo';
import { HardDrive, Timer, X } from 'lucide-react';
import {
  storageProviders,
  lockoutProviders,
  memoryProviders,
  emailProviders,
  type CustomProviderConfig,
  EmailTestButton,
  parseCustomModel,
} from './shared';

export function IntegrationsTab({
  user,
  customModelsList,
  customProviders,
}: {
  user: SettingsUser;
  customModelsList: Model[];
  customProviders: CustomProviderConfig[];
}) {
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
  const [memoryCuratorEnabled, setMemoryCuratorEnabled] = useSyncedPreferences<boolean>(
    'zetora-memory-curator-enabled',
    true,
  );

  const [xqlEnabled, setXqlEnabled] = useSyncedPreferences<boolean>('zetora-xql-enabled', true);
  const [lookoutEnabled, setLookoutEnabled] = useSyncedPreferences<boolean>('zetora-lookout-enabled', true);
  const [voiceEnabled, setVoiceEnabled] = useSyncedPreferences<boolean>('zetora-voice-enabled', true);
  const [appsEnabled, setAppsEnabled] = useSyncedPreferences<boolean>('zetora-apps-enabled', true);
  const [swarmEnabled, setSwarmEnabled] = useSyncedPreferences<boolean>('zetora-swarm-enabled', true);
  const [connectorsEnabled, setConnectorsEnabled] = useSyncedPreferences<boolean>('zetora-connectors-enabled', true);
  const [canvasEnabled, setCanvasEnabled] = useSyncedPreferences<boolean>('zetora-canvas-enabled', true);
  const [agentEnabled, setAgentEnabled] = useSyncedPreferences<boolean>('zetora-agent-enabled', true);

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
      const parsed = parseCustomModel(modelId, customProviders);
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
      const parsed = parseCustomModel(modelId, customProviders);
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

  return (
    <>
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

          {/* Memory Curator */}
          <div className="flex items-center justify-between py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Memory Curator</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Background model that reviews finished chats and decides what to save to memory
              </p>
            </div>
            <Switch
              id="memory-curator-enabled"
              checked={memoryCuratorEnabled}
              onCheckedChange={setMemoryCuratorEnabled}
            />
          </div>
        </div>
      </div>
      <div className="mt-4">
        {/* Tools */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-medium">Tools</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Show or hide tool shortcuts in the sidebar and chat modes
            </p>
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
              <p className="text-xs text-muted-foreground mt-0.5">Show the X/Twitter search shortcut in the sidebar</p>
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
              <p className="text-xs text-muted-foreground mt-0.5">
                Show the Apps shortcut in the sidebar and the + menu
              </p>
            </div>
            <Switch id="apps-enabled" checked={appsEnabled} onCheckedChange={setAppsEnabled} />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Swarm mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show Swarm mode in the + menu</p>
            </div>
            <Switch id="swarm-enabled" checked={swarmEnabled} onCheckedChange={setSwarmEnabled} />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Connectors</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show Connectors in the + menu</p>
            </div>
            <Switch id="connectors-enabled" checked={connectorsEnabled} onCheckedChange={setConnectorsEnabled} />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Canvas</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show Canvas in the + menu</p>
            </div>
            <Switch id="canvas-enabled" checked={canvasEnabled} onCheckedChange={setCanvasEnabled} />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Agent</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show the personal Agent mode in the + menu</p>
            </div>
            <Switch id="agent-enabled" checked={agentEnabled} onCheckedChange={setAgentEnabled} />
          </div>
        </div>

        {/* An extension may render its own per-connector settings here (e.g.
            the agent overlay's off/read-only/full toggles, C4) — nothing
            renders when no overlay is checked out. */}
        <ExtensionSlot name="settings-connectors" />

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
        </div>
      </div>
    </>
  );
}
