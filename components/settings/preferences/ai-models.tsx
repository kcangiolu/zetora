'use client';

import type { SettingsUser } from '../shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelectorDialog } from '@/components/ui/model-selector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { type Model } from '@/ai/models';
import { sileo } from 'sileo';
import { useQueryClient } from '@tanstack/react-query';
import { TrashIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { X, Loader2, Zap, ZapOff, Plus, Shield, ShieldOff, RefreshCw, Cloud, Cpu } from 'lucide-react';
import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  type CustomProviderConfig,
  type CustomBackendKind,
  type AutoRouterRoute,
  type AutoRouterConfig,
  getDefaultAutoRouterRoutes,
  TertiaryModelRow,
} from './shared';

const BACKEND_KIND_LABEL: Record<CustomBackendKind, string> = {
  llamacpp: 'llama.cpp',
  vllm: 'vLLM',
  ollama: 'Ollama',
  openai: 'OpenAI-compatible',
  unknown: 'Unknown backend',
};

// Options for the manual backend-kind selector — 'auto' isn't a real
// CustomBackendKind, it means "let the /props /api/version /health probe
// decide" (existing behavior, still the default).
const BACKEND_KIND_OPTIONS: Array<{ value: CustomBackendKind | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'llamacpp', label: 'llama.cpp' },
  { value: 'vllm', label: 'vLLM' },
];

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
  const [newProvider, setNewProvider] = useState<{
    name: string;
    baseURL: string;
    apiKey: string;
    backendKind: CustomBackendKind | 'auto';
  }>({ name: '', baseURL: '', apiKey: '', backendKind: 'auto' });
  const [detectingModels, setDetectingModels] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [detectedBackendKind, setDetectedBackendKind] = useState<CustomBackendKind | null>(null);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [redetectingBackendId, setRedetectingBackendId] = useState<string | null>(null);
  const [expandedEnrichedShimId, setExpandedEnrichedShimId] = useState<string | null>(null);

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
      setDetectedBackendKind(data.backendKind ?? null);
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
      const { backendKind: manualBackendKind, ...providerFields } = newProvider;
      const finalBackendKind = manualBackendKind === 'auto' ? (detectedBackendKind ?? undefined) : manualBackendKind;
      const updated = [
        ...customProviders.filter((p) => p.id !== id),
        { id, ...providerFields, backendKind: finalBackendKind },
      ];
      const res = await fetch('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: updated }),
      });
      if (!res.ok) throw new Error('Save failed');
      setCustomProviders(updated);
      setNewProvider({ name: '', baseURL: '', apiKey: '', backendKind: 'auto' });
      setDetectedModels([]);
      setDetectedBackendKind(null);
      setShowCustomProviderForm(false);
      queryClient.invalidateQueries({ queryKey: ['customModels'] });
      sileo.success({ title: 'Provider saved', description: newProvider.name });
    } catch (e) {
      sileo.error({ title: 'Failed to save provider', description: String(e) });
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleRedetectBackend = async (provider: CustomProviderConfig) => {
    setRedetectingBackendId(provider.id);
    try {
      const res = await fetch('/api/custom-providers/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL: provider.baseURL, apiKey: provider.apiKey || undefined }),
      });
      const data = await res.json();
      const updated = customProviders.map((p) =>
        p.id === provider.id ? { ...p, backendKind: (data.backendKind as CustomBackendKind) ?? 'unknown' } : p,
      );
      await fetch('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: updated }),
      });
      setCustomProviders(updated);
      queryClient.invalidateQueries({ queryKey: ['customModels'] });
    } catch (e) {
      sileo.error({ title: 'Backend detection failed', description: String(e) });
    } finally {
      setRedetectingBackendId(null);
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

  const handleToggleEnrichedShim = async (id: string) => {
    const updated = customProviders.map((p) => (p.id === id ? { ...p, enrichedShim: !p.enrichedShim } : p));
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

  const handleSetBackendKind = async (id: string, backendKind: CustomBackendKind) => {
    const updated = customProviders.map((p) => (p.id === id ? { ...p, backendKind } : p));
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
                <div key={p.id}>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[10px] text-green-500">●</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground/60 truncate">{p.baseURL}</p>
                        <Select
                          value={p.backendKind ?? 'unknown'}
                          onValueChange={(value) => handleSetBackendKind(p.id, value as CustomBackendKind)}
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-6 mt-1 text-[11px] px-2 gap-1 rounded-md border border-border/50 bg-muted/40 hover:bg-muted/70 text-foreground/70 shadow-none w-fit"
                            title="Backend kind — governs whether the reasoning-effort toggle can send real control parameters or can only hide thinking output"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(BACKEND_KIND_LABEL) as CustomBackendKind[]).map((kind) => (
                              <SelectItem key={kind} value={kind} className="text-xs">
                                {BACKEND_KIND_LABEL[kind]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(p.backendKind === 'llamacpp' || p.backendKind === 'ollama') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="Enriched compatibility mode settings"
                          onClick={() => setExpandedEnrichedShimId((cur) => (cur === p.id ? null : p.id))}
                        >
                          {p.enrichedShim ? <Cloud className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        title="Re-detect backend kind (Ollama / vLLM / llama.cpp)"
                        disabled={redetectingBackendId === p.id}
                        onClick={() => handleRedetectBackend(p)}
                      >
                        {redetectingBackendId === p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                      </Button>
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
                  {expandedEnrichedShimId === p.id && (p.backendKind === 'llamacpp' || p.backendKind === 'ollama') && (
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/20 gap-6 border-t border-border/40">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Enriched compatibility mode</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Route this provider&apos;s requests through the standard OpenAI-compatible API instead of
                          talking to {p.backendKind === 'llamacpp' ? 'llama.cpp' : 'Ollama'} directly. Adds: image
                          attachments, and the server&apos;s own chat-template rendering (fewer formatting quirks).
                          Removes: real prompt prefill (/startwith), grammar constraints, mirostat and other native
                          sampling controls.
                        </p>
                      </div>
                      <Switch
                        id={`enriched-shim-${p.id}`}
                        checked={p.enrichedShim ?? false}
                        onCheckedChange={() => handleToggleEnrichedShim(p.id)}
                      />
                    </div>
                  )}
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
              <Select
                value={newProvider.backendKind}
                onValueChange={(value) =>
                  setNewProvider((v) => ({ ...v, backendKind: value as CustomBackendKind | 'auto' }))
                }
              >
                <SelectTrigger className="h-8 text-xs rounded-lg w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKEND_KIND_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {detectedBackendKind && (
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium">Backend:</span> {BACKEND_KIND_LABEL[detectedBackendKind]}
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
              effortKey="zetora-default-effort"
              recommendedEffort="auto"
              label="Default Model"
              description="Fallback model used by Lookout and other tasks"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-chat-title-model"
              providerKey="zetora-tertiary-chat-title-provider"
              effortKey="zetora-tertiary-chat-title-effort"
              recommendedEffort="off"
              label="Chat Title"
              description="Generates titles for new chats"
              defaultModelLabel="Gemini 3.1 Flash Lite"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-followup-model"
              providerKey="zetora-tertiary-followup-provider"
              effortKey="zetora-tertiary-followup-effort"
              recommendedEffort="off"
              label="Follow-up Questions"
              description="Generates questions after each response"
              defaultModelLabel="Gemini 3.1 Flash Lite"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-enhance-model"
              providerKey="zetora-tertiary-enhance-provider"
              effortKey="zetora-tertiary-enhance-effort"
              recommendedEffort="auto"
              label="Prompt Enhancement"
              description="Rewrites prompts (Enhance button)"
              defaultModelLabel="Kimi K2"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-tool-repair-model"
              providerKey="zetora-tertiary-tool-repair-provider"
              effortKey="zetora-tertiary-tool-repair-effort"
              recommendedEffort="auto"
              label="Tool Call Repair"
              description="Fixes malformed tool call arguments"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-auto-router-model"
              providerKey="zetora-tertiary-auto-router-provider"
              effortKey="zetora-tertiary-auto-router-effort"
              recommendedEffort="auto"
              label="Auto Router"
              description="Classifies queries for model routing"
              defaultModelLabel="Arch-Router 1.5B"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-translate-text-model"
              providerKey="zetora-tertiary-translate-text-provider"
              effortKey="zetora-tertiary-translate-text-effort"
              recommendedEffort="auto"
              label="Text Translation"
              description="Translates text between languages"
              defaultModelLabel="Gemini 3 Flash"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-translate-vision-model"
              providerKey="zetora-tertiary-translate-vision-provider"
              effortKey="zetora-tertiary-translate-vision-effort"
              recommendedEffort="auto"
              label="Vision Translation"
              description="Extracts and translates text from images"
              defaultModelLabel="Gemini 3 Flash"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-lang-detect-model"
              providerKey="zetora-tertiary-lang-detect-provider"
              effortKey="zetora-tertiary-lang-detect-effort"
              recommendedEffort="auto"
              label="Language Detection"
              description="Detects language of input text"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-extreme-planner-model"
              providerKey="zetora-tertiary-extreme-planner-provider"
              effortKey="zetora-tertiary-extreme-planner-effort"
              recommendedEffort="auto"
              label="Extreme Search Planner"
              description="Generates research plans in Extreme mode"
              defaultModelLabel="Grok 4.1 Fast (Reasoning)"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-extreme-agent-model"
              providerKey="zetora-tertiary-extreme-agent-provider"
              effortKey="zetora-tertiary-extreme-agent-effort"
              recommendedEffort="auto"
              label="Extreme Search Agent"
              description="Executes the autonomous research loop"
              defaultModelLabel="Grok 4.1 Fast (Reasoning)"
              additionalModels={customModelsList}
              user={user}
              hideReasoningEffort
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-voice-model"
              providerKey="zetora-tertiary-voice-provider"
              effortKey="zetora-tertiary-voice-effort"
              recommendedEffort="off"
              label="Voice (Local Backend)"
              description="LLM used by the local speech-to-speech backend"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-memory-curator-model"
              providerKey="zetora-tertiary-memory-curator-provider"
              effortKey="zetora-tertiary-memory-curator-effort"
              recommendedEffort="auto"
              label="Memory Curator"
              description="Reviews finished chats and decides what to save to memory"
              defaultModelLabel="Grok 4.1 Fast"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-agent-worker-model"
              providerKey="zetora-tertiary-agent-worker-provider"
              effortKey="zetora-tertiary-agent-worker-effort"
              recommendedEffort="auto"
              label="Agent Worker"
              description="Drives the sandboxed coding agent — needs strong tool calling over long runs"
              defaultModelLabel="Claude Sonnet 5"
              additionalModels={customModelsList}
              user={user}
            />
            <TertiaryModelRow
              modelKey="zetora-tertiary-agent-guard-model"
              providerKey="zetora-tertiary-agent-guard-provider"
              effortKey="zetora-tertiary-agent-guard-effort"
              recommendedEffort="off"
              label="Agent Guard"
              description="Checks each agent action against your original request. Pick a different provider than Agent Worker, so one outage can't take out both the actor and its reviewer"
              defaultModelLabel="Gemini 3 Flash"
              additionalModels={customModelsList}
              user={user}
            />
          </div>
        </div>
      </div>
    </>
  );
}
