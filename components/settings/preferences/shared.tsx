import type { SettingsUser } from '../shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSyncedPreferences, type PreferenceKey, type ImageGenPromptPreset } from '@/hooks/use-synced-preferences';
import { testEmailDelivery } from '@/app/actions';
import { Check, X, Trash2, Save, Power, PowerOff } from 'lucide-react';
import { useState } from 'react';
import { getModelConfig, getModelProvider, type Model } from '@/ai/models';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReasoningEffortToggle } from '@/components/ui/form-component/reasoning-effort-toggle';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { GlobalSearchIcon, Rocket01Icon } from '@hugeicons/core-free-icons';
import { Loader2, Search, CheckCircle2, XCircle, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ModelSelectorDialog } from '@/components/ui/model-selector';

const ParallelIcon = ({ className }: { className?: string }) => (
  <Image
    src="/parallel-icon.svg"
    alt="Parallel AI"
    width={16}
    height={16}
    className={cn('bg-white rounded-full p-0.5', className)}
  />
);

const ExaIcon = ({ className }: { className?: string }) => (
  <Image src="/exa-color.svg" alt="Exa" width={16} height={16} className={className} />
);

const FirecrawlIcon = ({ className }: { className?: string }) => (
  <span className={cn('text-base sm:text-lg mb-3! pr-1!', className)}>🔥</span>
);

const SearXNGIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={GlobalSearchIcon} size={16} className={className} />
);

const FastCrwIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={Rocket01Icon} size={16} className={className} />
);

// Search Provider Options
export const searchProviders = [
  {
    value: 'exa',
    label: 'Exa',
    description: 'Enhanced and faster web search with images and advanced filtering',
    icon: ExaIcon,
    default: true,
  },
  {
    value: 'firecrawl',
    label: 'Firecrawl',
    description: 'Web, news, and image search with content scraping capabilities',
    icon: FirecrawlIcon,
    default: false,
  },
  {
    value: 'parallel',
    label: 'Parallel AI',
    description: 'Base and premium web search along with Firecrawl image search support',
    icon: ParallelIcon,
    default: false,
  },
  {
    value: 'searxng',
    label: 'SearXNG',
    description: 'Self-hosted metasearch engine aggregating results from multiple sources',
    icon: SearXNGIcon,
    default: false,
  },
  {
    value: 'fastcrw',
    label: 'fastCRW',
    description: 'Self-hosted Rust scraper & search — Firecrawl-compatible API',
    icon: FastCrwIcon,
    default: false,
  },
] as const;

export const storageProviders = [
  {
    value: 'cloudflare-r2',
    label: 'Cloudflare R2',
    description: 'Cloudflare object storage with zero egress fees',
    default: true,
  },
  {
    value: 'minio',
    label: 'MinIO',
    description: 'Self-hosted S3-compatible object storage',
    default: false,
  },
] as const;

export const lockoutProviders = [
  {
    value: 'qstash',
    label: 'Upstash QStash',
    description: "Service managé de scheduling HTTP. Gratuit jusqu'à 500 msg/jour.",
    default: true,
  },
  {
    value: 'bullmq',
    label: 'BullMQ',
    description: 'File de jobs Redis auto-hébergée avec Bull Board pour le monitoring.',
    default: false,
  },
] as const;

export const memoryProviders = [
  { value: 'supermemory', label: 'SuperMemory' },
  { value: 'graphiti', label: 'Graphiti' },
] as const;

export const emailProviders = [
  { value: 'resend', label: 'Resend (API)' },
  { value: 'smtp', label: 'SMTP' },
] as const;

export type CustomBackendKind = 'ollama' | 'vllm' | 'llamacpp' | 'openai' | 'unknown';

export type CustomProviderConfig = {
  id: string;
  name: string;
  baseURL: string;
  // Never populated from GET /api/custom-providers (server redacts stored
  // keys) — only set locally while typing a new provider into the add form.
  apiKey?: string;
  hasApiKey?: boolean;
  disableAutoDetect?: boolean;
  anonymize?: boolean;
  // Detected inference server kind, set once via the "Detect Models" probe.
  // Governs whether the reasoning-effort toggle can send a real control
  // parameter ('vllm'/'llamacpp') or can only hide the <think> output.
  backendKind?: CustomBackendKind;
  // Forces a llamacpp/ollama-classified provider back onto the
  // OpenAI-compatible shim instead of the native provider — see
  // shouldUseNativeCustomProvider in lib/custom-providers.ts.
  enrichedShim?: boolean;
};

// Resolves a 'custom-<provider>-<model>' picker id back to its provider entry.
export function parseCustomModel(modelId: string, providers: CustomProviderConfig[]) {
  if (!modelId.startsWith('custom-')) return null;
  const withoutPrefix = modelId.slice('custom-'.length);
  for (const provider of providers) {
    if (withoutPrefix.startsWith(`${provider.id}-`)) {
      return { modelName: withoutPrefix.slice(`${provider.id}-`.length), provider };
    }
  }
  return null;
}

export type AutoRouterRoute = {
  name: string;
  description: string;
  model: string;
};

export type AutoRouterConfig = {
  routes: AutoRouterRoute[];
};

export function getDefaultAutoRouterRoutes(): AutoRouterRoute[] {
  return [
    {
      name: 'general',
      description: 'General questions and conversations',
      model: 'zetora-default',
    },
    {
      name: 'research',
      description: 'Academic research, papers, and scientific topics',
      model: 'zetora-gemini-3-flash',
    },
    {
      name: 'code_generation',
      description: 'Generating code, scripts, or programming tasks',
      model: 'zetora-qwen-coder-next',
    },
    {
      name: 'writing',
      description: 'Creative writing, documentation, and content creation',
      model: 'zetora-kimi-k2.5',
    },
    {
      name: 'analysis',
      description: 'Data analysis, reasoning, and problem solving',
      model: 'zetora-gpt-5.2',
    },
  ];
}

type TertiaryModelPrefKey =
  | 'zetora-default-model'
  | 'zetora-tertiary-chat-title-model'
  | 'zetora-tertiary-followup-model'
  | 'zetora-tertiary-enhance-model'
  | 'zetora-tertiary-tool-repair-model'
  | 'zetora-tertiary-auto-router-model'
  | 'zetora-tertiary-translate-text-model'
  | 'zetora-tertiary-translate-vision-model'
  | 'zetora-tertiary-lang-detect-model'
  | 'zetora-tertiary-extreme-planner-model'
  | 'zetora-tertiary-extreme-agent-model'
  | 'zetora-tertiary-voice-model'
  | 'zetora-tertiary-memory-curator-model'
  | 'zetora-tertiary-agent-worker-model'
  | 'zetora-tertiary-agent-guard-model';

type TertiaryProviderPrefKey =
  | 'zetora-default-provider'
  | 'zetora-tertiary-chat-title-provider'
  | 'zetora-tertiary-followup-provider'
  | 'zetora-tertiary-enhance-provider'
  | 'zetora-tertiary-tool-repair-provider'
  | 'zetora-tertiary-auto-router-provider'
  | 'zetora-tertiary-translate-text-provider'
  | 'zetora-tertiary-translate-vision-provider'
  | 'zetora-tertiary-lang-detect-provider'
  | 'zetora-tertiary-extreme-planner-provider'
  | 'zetora-tertiary-extreme-agent-provider'
  | 'zetora-tertiary-voice-provider'
  | 'zetora-tertiary-memory-curator-provider'
  | 'zetora-tertiary-agent-worker-provider'
  | 'zetora-tertiary-agent-guard-provider';

export function TertiaryModelRow({
  modelKey,
  providerKey,
  effortKey,
  enabledKey,
  recommendedEffort = 'auto',
  label,
  description,
  defaultModelLabel,
  additionalModels,
  user,
  hideReasoningEffort = false,
}: {
  modelKey: TertiaryModelPrefKey;
  providerKey: TertiaryProviderPrefKey;
  effortKey: PreferenceKey;
  // When set, renders an on/off toggle that lets the user disable this
  // background task entirely (e.g. chat title / follow-up questions
  // generation) instead of only picking which model runs it.
  enabledKey?: PreferenceKey;
  recommendedEffort?: ReasoningEffort;
  label: string;
  description: string;
  defaultModelLabel: string;
  additionalModels: Model[];
  user: SettingsUser;
  // This task's model call always forces a provider-level override that
  // makes the reasoning-effort toggle a no-op (see ai/tertiary.ts) — showing
  // it would imply a control that doesn't do anything.
  hideReasoningEffort?: boolean;
}) {
  const [model, setModel] = useSyncedPreferences<string>(modelKey as PreferenceKey, '');
  const [, setProvider] = useSyncedPreferences<string>(providerKey as PreferenceKey, '');
  const [effort, setEffort] = useSyncedPreferences<ReasoningEffort>(effortKey, recommendedEffort);

  const handleSelect = (modelValue: string) => {
    setModel(modelValue);
    const explicitProvider =
      getModelConfig(modelValue)?.provider ?? additionalModels.find((m) => m.value === modelValue)?.provider;
    const provider = modelValue.startsWith('custom-')
      ? 'custom'
      : (explicitProvider ?? String(getModelProvider(modelValue)));
    setProvider(provider);
  };

  return (
    <div className="flex items-center justify-between py-3.5 gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {enabledKey ? (
          <TertiaryTaskToggle enabledKey={enabledKey}>
            <TertiaryModelControls
              model={model}
              defaultModelLabel={defaultModelLabel}
              handleSelect={handleSelect}
              user={user}
              additionalModels={additionalModels}
              hideReasoningEffort={hideReasoningEffort}
              effort={effort}
              recommendedEffort={recommendedEffort}
              setEffort={setEffort}
              setModel={setModel}
              setProvider={setProvider}
            />
          </TertiaryTaskToggle>
        ) : (
          <TertiaryModelControls
            model={model}
            defaultModelLabel={defaultModelLabel}
            handleSelect={handleSelect}
            user={user}
            additionalModels={additionalModels}
            hideReasoningEffort={hideReasoningEffort}
            effort={effort}
            recommendedEffort={recommendedEffort}
            setEffort={setEffort}
            setModel={setModel}
            setProvider={setProvider}
          />
        )}
      </div>
    </div>
  );
}

// Owns the enabled/disabled preference for a background task (only mounted
// for rows that pass `enabledKey`) and dims its children when disabled,
// instead of letting TertiaryModelRow itself hold a hook bound to a key that
// may not exist for every task.
function TertiaryTaskToggle({ enabledKey, children }: { enabledKey: PreferenceKey; children: React.ReactNode }) {
  const [enabled, setEnabled] = useSyncedPreferences<boolean>(enabledKey, true);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          'h-8 w-8 shrink-0',
          enabled ? 'text-muted-foreground hover:text-foreground' : 'text-destructive hover:text-destructive',
        )}
        title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        onClick={() => setEnabled(!enabled)}
      >
        {enabled ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
      </Button>
      <div className={cn('flex items-center gap-1.5 shrink-0', !enabled && 'opacity-40 pointer-events-none')}>
        {children}
      </div>
    </>
  );
}

function TertiaryModelControls({
  model,
  defaultModelLabel,
  handleSelect,
  user,
  additionalModels,
  hideReasoningEffort,
  effort,
  recommendedEffort,
  setEffort,
  setModel,
  setProvider,
}: {
  model: string;
  defaultModelLabel: string;
  handleSelect: (modelValue: string) => void;
  user: SettingsUser;
  additionalModels: Model[];
  hideReasoningEffort: boolean;
  effort: ReasoningEffort;
  recommendedEffort: ReasoningEffort;
  setEffort: (value: ReasoningEffort | ((val: ReasoningEffort) => ReasoningEffort)) => void;
  setModel: (value: string | ((val: string) => string)) => void;
  setProvider: (value: string | ((val: string) => string)) => void;
}) {
  return (
    <>
      {!model && (
        <span
          className="text-[11px] text-muted-foreground/70 shrink-0 max-w-[160px] truncate"
          title={`Default : ${defaultModelLabel}`}
        >
          Default : {defaultModelLabel}
        </span>
      )}
      <ModelSelectorDialog
        selectedModel={model}
        onModelSelect={handleSelect}
        user={user}
        additionalModels={additionalModels}
        className="w-[180px] h-8"
        compact
      />
      {/* Capability for the system default model isn't known here (no
          model id, just a display label) — only show once the user has
          picked a specific model for this task. */}
      {model && !hideReasoningEffort && (
        <ReasoningEffortToggle
          selectedModel={model}
          value={effort ?? recommendedEffort}
          onChange={setEffort}
          customModels={additionalModels}
        />
      )}
      {model && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          title="Reset to default"
          onClick={() => {
            setModel('');
            setProvider('');
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </>
  );
}

export function EmailTestButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleTest = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const result = await testEmailDelivery();
      if (result.success) {
        setStatus('success');
        setMessage(`Test email sent successfully via ${result.provider}. Check your inbox.`);
      } else {
        setStatus('error');
        setMessage(result.error || 'Failed to send test email');
      }
    } catch {
      setStatus('error');
      setMessage('An unexpected error occurred');
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={handleTest} disabled={status === 'loading'} className="gap-2">
        {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {status === 'loading' ? 'Sending...' : 'Send Test Email'}
      </Button>

      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>{message}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}

// The 11 single-purpose search tools — always-on, filtered by the
// zetora-enabled-sources preference, rather than an exclusive mode you pick
// (see the matching SOURCE_CATALOG_IDS in components/ui/form-component.tsx).
export const SOURCE_CATALOG_IDS = [
  'web',
  'x',
  'stocks',
  'code',
  'academic',
  'reddit',
  'github',
  'crypto',
  'prediction',
  'youtube',
  'spotify',
];

// Shared editor for the per-skill "custom instructions" textarea + named
// presets, used identically by the Image Generation and Image Editing
// sections below. The default (built-in) instructions are always applied
// server-side — this only edits the text appended on top of them — so we
// surface them read-only here, auto-expanded while no custom prompt is set.
//
// Presets bundle the model name together with the custom instructions text,
// but picking one from the dropdown only stages it — nothing is written to
// the live systemPrompt/model fields until "Apply" is clicked, so there's no
// ambiguity about whether a preset actually took effect.
export function ImagePromptPresetEditor({
  skillLabel,
  defaultInstructions,
  systemPrompt,
  setSystemPrompt,
  model,
  setModel,
  presets,
  setPresets,
  selectedPresetId,
  setSelectedPresetId,
  newPresetName,
  setNewPresetName,
}: {
  skillLabel: string;
  defaultInstructions: string;
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  presets: ImageGenPromptPreset[];
  setPresets: (value: ImageGenPromptPreset[]) => void;
  selectedPresetId: string;
  setSelectedPresetId: (value: string) => void;
  newPresetName: string;
  setNewPresetName: (value: string) => void;
}) {
  const selectedPreset = presets.find((p) => p.id === selectedPresetId);
  // Purely visual confirmation that the click landed and the fields were
  // written — setSystemPrompt/setModel are synchronous, so there's nothing
  // to actually wait on, but a static "Apply" label gives no feedback that
  // anything happened, which read as "the button doesn't do anything".
  const [justApplied, setJustApplied] = useState(false);

  return (
    <div className="space-y-1.5 col-span-2 pt-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] text-muted-foreground">Custom instructions for the model (optional)</Label>
        {systemPrompt && (
          <button
            type="button"
            onClick={() => setSystemPrompt('')}
            className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/60 -mt-0.5">
        Appended to the {skillLabel} skill guidance — e.g. style/quality tags, negative prompts, or notes about which
        checkpoint is configured (SDXL, Pony, etc.)
      </p>
      <Textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder={
          'e.g. "This model is SDXL-based. Prefer natural-language prompts over booru tags. Always append: masterpiece, high detail. Avoid text or watermarks."'
        }
        rows={5}
        className="text-xs rounded-md resize-y min-h-20 max-h-56 overflow-y-auto"
      />
      <details key={systemPrompt ? 'has-custom' : 'no-custom'} open={!systemPrompt}>
        <summary className="cursor-pointer text-[10px] text-muted-foreground/60 hover:text-foreground select-none">
          Default instructions (always applied first)
        </summary>
        <pre className="mt-1.5 whitespace-pre-wrap text-[10px] text-muted-foreground/70 bg-muted/30 rounded-md p-2.5 border border-border/40 max-h-56 overflow-y-auto font-mono">
          {defaultInstructions}
        </pre>
      </details>
      <div className="flex items-center gap-1.5 pt-0.5">
        <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
          <SelectTrigger className="h-7 text-xs rounded-md flex-1">
            <SelectValue placeholder="Load a preset…" />
          </SelectTrigger>
          <SelectContent>
            {presets.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground/60">No presets saved yet</p>
            ) : (
              presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} className="text-xs">
                  {preset.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-7 text-xs shrink-0"
          disabled={!selectedPreset}
          onClick={() => {
            if (!selectedPreset) return;
            setSystemPrompt(selectedPreset.prompt);
            setModel(selectedPreset.model ?? '');
            setJustApplied(true);
            setTimeout(() => setJustApplied(false), 1500);
          }}
        >
          {justApplied ? (
            <>
              <Check className="size-3 mr-1" />
              Applied
            </>
          ) : (
            'Apply'
          )}
        </Button>
        {selectedPresetId && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => {
              setPresets(presets.filter((p) => p.id !== selectedPresetId));
              setSelectedPresetId('');
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {selectedPreset && (
        <p className="text-[10px] text-muted-foreground/60 -mt-1">
          Model: <span className="font-mono">{selectedPreset.model || '(none set)'}</span> — click Apply to load this
          preset&apos;s instructions and model.
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          value={newPresetName}
          onChange={(e) => setNewPresetName(e.target.value)}
          placeholder="Preset name…"
          className="h-7 text-xs rounded-md flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs shrink-0"
          disabled={!newPresetName.trim() || (!systemPrompt.trim() && !model.trim())}
          onClick={() => {
            const name = newPresetName.trim();
            if (!name) return;
            const existing = presets.find((p) => p.name === name);
            if (existing) {
              setPresets(presets.map((p) => (p.id === existing.id ? { ...p, prompt: systemPrompt, model } : p)));
              setSelectedPresetId(existing.id);
            } else {
              const id = crypto.randomUUID();
              setPresets([...presets, { id, name, prompt: systemPrompt, model }]);
              setSelectedPresetId(id);
            }
            setNewPresetName('');
          }}
        >
          <Save className="size-3 mr-1" />
          Save as preset
        </Button>
      </div>
    </div>
  );
}

// Component for Combined Preferences (Search + Custom Instructions)
