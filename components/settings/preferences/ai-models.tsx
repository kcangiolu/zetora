'use client';

import type { SettingsUser } from '../shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelectorDialog } from '@/components/ui/model-selector';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { type Model } from '@/ai/models';
import { sileo } from 'sileo';
import { useQueryClient } from '@tanstack/react-query';
import { TrashIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { X, Loader2, Zap, ZapOff, Plus, Shield, ShieldOff } from 'lucide-react';
import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  type CustomProviderConfig,
  type AutoRouterRoute,
  type AutoRouterConfig,
  getDefaultAutoRouterRoutes,
  TertiaryModelRow,
} from './shared';

export function AiModelsTab({
  user,
  customModelsList,
  customProviders,
  setCustomProviders,
}: {
  user: SettingsUser;
  customModelsList: Model[];
  customProviders: CustomProviderConfig[];
  setCustomProviders: Dispatch<SetStateAction<CustomProviderConfig[]>>;
}) {
  const [autoRouterEnabled, setAutoRouterEnabled] = useSyncedPreferences<boolean>('zetora-auto-router-enabled', false);
  const [autoRouterConfig, setAutoRouterConfig] = useSyncedPreferences<AutoRouterConfig>('zetora-auto-router-config', {
    routes: getDefaultAutoRouterRoutes(),
  });

  const [xmlToolParsingEnabled, setXmlToolParsingEnabled] = useSyncedPreferences<boolean>(
    'zetora-xml-tool-parsing-enabled',
    false,
  );

  const queryClient = useQueryClient();

  const [showCustomProviderForm, setShowCustomProviderForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: '', baseURL: '', apiKey: '' });
  const [detectingModels, setDetectingModels] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [isSavingProvider, setIsSavingProvider] = useState(false);

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
    <>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Auto Router toggle */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Auto Model Router</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Route queries to the best model based on intent</p>
            </div>
            <Switch
              id="auto-router-enabled"
              checked={autoRouterEnabled}
              onCheckedChange={(value) => {
                setAutoRouterEnabled(value);
              }}
            />
          </div>

          {/* Auto Router routes - inline expand (enabled only) */}
          {autoRouterEnabled && (
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
                Enable XML tool call parsing for custom providers (Ollama, llama.cpp, vLLM, OpenRouter). Required for
                models like Qwen, Hermes, GLM, and DeepSeek that output tool calls as text instead of OpenAI-compatible
                JSON. The format is detected automatically (Morph XML, Qwen3-Coder, and Hermes JSON).
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
            <p className="text-xs text-muted-foreground mt-0.5">Choose which model to use for each background task</p>
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
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-chat-title-model"
              providerKey="zetora-tertiary-chat-title-provider"
              label="Chat Title"
              description="Generates titles for new chats"
              defaultModelLabel="Gemini 3.1 Flash Lite"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-followup-model"
              providerKey="zetora-tertiary-followup-provider"
              label="Follow-up Questions"
              description="Generates questions after each response"
              defaultModelLabel="Gemini 3.1 Flash Lite"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-enhance-model"
              providerKey="zetora-tertiary-enhance-provider"
              label="Prompt Enhancement"
              description="Rewrites prompts (Enhance button)"
              defaultModelLabel="Kimi K2"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-tool-repair-model"
              providerKey="zetora-tertiary-tool-repair-provider"
              label="Tool Call Repair"
              description="Fixes malformed tool call arguments"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-auto-router-model"
              providerKey="zetora-tertiary-auto-router-provider"
              label="Auto Router"
              description="Classifies queries for model routing"
              defaultModelLabel="Arch-Router 1.5B"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-translate-text-model"
              providerKey="zetora-tertiary-translate-text-provider"
              label="Text Translation"
              description="Translates text between languages"
              defaultModelLabel="Gemini 3 Flash"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-translate-vision-model"
              providerKey="zetora-tertiary-translate-vision-provider"
              label="Vision Translation"
              description="Extracts and translates text from images"
              defaultModelLabel="Gemini 3 Flash"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-lang-detect-model"
              providerKey="zetora-tertiary-lang-detect-provider"
              label="Language Detection"
              description="Detects language of input text"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-extreme-planner-model"
              providerKey="zetora-tertiary-extreme-planner-provider"
              label="Extreme Search Planner"
              description="Generates research plans in Extreme mode"
              defaultModelLabel="Grok 4.1 Fast (Reasoning)"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-extreme-agent-model"
              providerKey="zetora-tertiary-extreme-agent-provider"
              label="Extreme Search Agent"
              description="Executes the autonomous research loop"
              defaultModelLabel="Grok 4.1 Fast (Reasoning)"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-voice-model"
              providerKey="zetora-tertiary-voice-provider"
              label="Voice (Local Backend)"
              description="LLM used by the local speech-to-speech backend"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-memory-curator-model"
              providerKey="zetora-tertiary-memory-curator-provider"
              label="Memory Curator"
              description="Reviews finished chats and decides what to save to memory"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
          </div>
        </div>
      </div>
    </>
  );
}
