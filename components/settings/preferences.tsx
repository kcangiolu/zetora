'use client';

import { Button } from '@/components/ui/button';

import { Label } from '@/components/ui/label';

import { Skeleton } from '@/components/ui/skeleton';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { Textarea } from '@/components/ui/textarea';

import { useSyncedPreferences, type PreferenceKey, type ImageGenPromptPreset } from '@/hooks/use-synced-preferences';
import {
  IMAGE_GENERATION_DEFAULT_INSTRUCTIONS,
  IMAGE_EDITING_DEFAULT_INSTRUCTIONS,
} from '@/lib/skills/image-prompt-defaults';
import {
  getCustomInstructions,
  saveCustomInstructions,
  deleteCustomInstructionsAction,
  testEmailDelivery,
} from '@/app/actions';

import { all } from 'better-all';

import { TrashIcon, FloppyDiskIcon } from '@phosphor-icons/react';

import {
  ChevronDown,
  Check,
  X,
  AlertCircle,
  Trash2,
  Save,
} from 'lucide-react';

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ComponentType,
} from 'react';

import { sileo } from 'sileo';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Loader2,
  Search,
  Zap,
  ZapOff,
  Plus,
  HardDrive,
  Timer,
  CheckCircle2,
  XCircle,
  Mail,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { getSearchGroups } from '@/lib/utils';
import {
  models,
  PROVIDERS,
  getModelProvider,
  type ModelProvider,
  type Model,
} from '@/ai/models';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

import { ThemeSwitcher } from '../theme-switcher';
import Image from 'next/image';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { GlobalSearchIcon, Rocket01Icon } from '@hugeicons/core-free-icons';

import { TTS_PROVIDERS, type TTSProvider, getTTSProviderConfig } from '@/lib/tts-providers';
import { STT_PROVIDERS, type STTProvider, getSTTProviderConfig } from '@/lib/stt-providers';
import { VOICE_S2S_BACKENDS, type VoiceS2SBackend, getVoiceS2SBackendConfig } from '@/lib/s2s-backends';
// Custom visx-based chart components

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
const searchProviders = [
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

const storageProviders = [
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

const lockoutProviders = [
  {
    value: 'qstash',
    label: 'Upstash QStash',
    description: "Service managé de scheduling HTTP. Gratuit jusqu'à 500 msg/jour.",
    default: true,
  },
  {
    value: 'bullmq',
    label: 'BullMQ (Self-Hosted)',
    description: 'File de jobs Redis auto-hébergée avec Bull Board pour le monitoring.',
    default: false,
  },
] as const;

const memoryProviders = [
  { value: 'supermemory', label: 'SuperMemory' },
  { value: 'graphiti', label: 'Graphiti' },
] as const;

const emailProviders = [
  { value: 'resend', label: 'Resend (API)' },
  { value: 'smtp', label: 'SMTP' },
] as const;

type CustomProviderConfig = {
  id: string;
  name: string;
  baseURL: string;
  // Never populated from GET /api/custom-providers (server redacts stored
  // keys) — only set locally while typing a new provider into the add form.
  apiKey?: string;
  hasApiKey?: boolean;
  disableAutoDetect?: boolean;
  anonymize?: boolean;
};

type AutoRouterRoute = {
  name: string;
  description: string;
  model: string;
};

type AutoRouterConfig = {
  routes: AutoRouterRoute[];
};

function getDefaultAutoRouterRoutes(): AutoRouterRoute[] {
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
  | 'zetora-tertiary-voice-model';

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
  | 'zetora-tertiary-voice-provider';

function TertiaryModelRow({
  modelKey,
  providerKey,
  label,
  description,
  defaultModelLabel,
  additionalModels,
  user,
  isProUser,
  isMaxUser,
}: {
  modelKey: TertiaryModelPrefKey;
  providerKey: TertiaryProviderPrefKey;
  label: string;
  description: string;
  defaultModelLabel: string;
  additionalModels: Model[];
  user: any;
  isProUser: boolean;
  isMaxUser: boolean;
}) {
  const [model, setModel] = useSyncedPreferences<string>(modelKey as PreferenceKey, '');
  const [, setProvider] = useSyncedPreferences<string>(providerKey as PreferenceKey, '');

  const handleSelect = (modelValue: string) => {
    setModel(modelValue);
    const provider = modelValue.startsWith('custom-') ? 'custom' : String(getModelProvider(modelValue));
    setProvider(provider);
  };

  return (
    <div className="flex items-center justify-between py-3.5 gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
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
          isProUser={isProUser}
          isMaxUser={isMaxUser}
          additionalModels={additionalModels}
          className="w-[180px] h-8"
          compact
        />
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
      </div>
    </div>
  );
}

function EmailTestButton() {
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
const SOURCE_CATALOG_IDS = [
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
function ImagePromptPresetEditor({
  skillLabel,
  defaultInstructions,
  systemPrompt,
  setSystemPrompt,
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
  presets: ImageGenPromptPreset[];
  setPresets: (value: ImageGenPromptPreset[]) => void;
  selectedPresetId: string;
  setSelectedPresetId: (value: string) => void;
  newPresetName: string;
  setNewPresetName: (value: string) => void;
}) {
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
        Appended to the {skillLabel} skill guidance — e.g. style/quality tags, negative prompts, or notes about
        which checkpoint is configured (SDXL, Pony, etc.)
      </p>
      <Textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder={
          'e.g. "This model is SDXL-based. Prefer natural-language prompts over booru tags. Always append: masterpiece, high detail. Avoid text or watermarks."'
        }
        rows={5}
        className="text-xs rounded-md resize-y min-h-20"
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
        <Select
          value={selectedPresetId}
          onValueChange={(id) => {
            setSelectedPresetId(id);
            const preset = presets.find((p) => p.id === id);
            if (preset) setSystemPrompt(preset.prompt);
          }}
        >
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
          disabled={!newPresetName.trim() || !systemPrompt.trim()}
          onClick={() => {
            const name = newPresetName.trim();
            if (!name) return;
            const existing = presets.find((p) => p.name === name);
            if (existing) {
              setPresets(presets.map((p) => (p.id === existing.id ? { ...p, prompt: systemPrompt } : p)));
              setSelectedPresetId(existing.id);
            } else {
              const id = crypto.randomUUID();
              setPresets([...presets, { id, name, prompt: systemPrompt }]);
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
export function PreferencesSection({
  user,
  isCustomInstructionsEnabled,
  setIsCustomInstructionsEnabledAction,
}: {
  user: any;
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

  const [locationMetadataEnabled, setLocationMetadataEnabled] = useSyncedPreferences<boolean>(
    'zetora-location-metadata-enabled',
    false,
  );

  const [anonymizationEnabled, setAnonymizationEnabled] = useSyncedPreferences<boolean>(
    'zetora-anonymization-enabled',
    false,
  );
  const [anonymizationCustomTerms, setAnonymizationCustomTerms] = useSyncedPreferences<string[]>(
    'zetora-anonymization-custom-terms',
    [],
  );
  const [anonymizationCustomTermsInput, setAnonymizationCustomTermsInput] = useState(
    anonymizationCustomTerms.join(', '),
  );
  const [anonymizationFailOpen, setAnonymizationFailOpen] = useSyncedPreferences<boolean>(
    'zetora-anonymization-fail-open',
    false,
  );
  const [anonymizationNerEnabled, setAnonymizationNerEnabled] = useSyncedPreferences<boolean>(
    'zetora-anonymization-ner-enabled',
    true,
  );
  const [anonymizationLanguage, setAnonymizationLanguage] = useSyncedPreferences<'en' | 'fr'>(
    'zetora-anonymization-language',
    'en',
  );
  const [scrollToLatestOnOpen, setScrollToLatestOnOpen] = useSyncedPreferences<boolean>(
    'zetora-scroll-to-latest-on-open',
    false,
  );
  const [xqlEnabled, setXqlEnabled] = useSyncedPreferences<boolean>('zetora-xql-enabled', true);
  const [lookoutEnabled, setLookoutEnabled] = useSyncedPreferences<boolean>('zetora-lookout-enabled', true);
  const [voiceEnabled, setVoiceEnabled] = useSyncedPreferences<boolean>('zetora-voice-enabled', true);
  const [appsEnabled, setAppsEnabled] = useSyncedPreferences<boolean>('zetora-apps-enabled', true);
  const [voiceS2SBackend, setVoiceS2SBackend] = useSyncedPreferences<VoiceS2SBackend>(
    'zetora-voice-s2s-backend',
    'cloud',
  );
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

  const [ttsProvider, setTtsProvider] = useSyncedPreferences<TTSProvider>('zetora-tts-provider', 'elevenlabs');
  const [ttsCustomProviderId, setTtsCustomProviderId] = useSyncedPreferences<string>(
    'zetora-tts-custom-provider-id',
    '',
  );
  const [ttsOpenAIModel, setTtsOpenAIModel] = useSyncedPreferences<string>('zetora-tts-openai-model', 'qwen3-tts');
  const [ttsOpenAIVoice, setTtsOpenAIVoice] = useSyncedPreferences<string>('zetora-tts-openai-voice', 'af_bella');
  const [ttsOpenAILanguage, setTtsOpenAILanguage] = useSyncedPreferences<string>(
    'zetora-tts-openai-language',
    'French',
  );

  const [sttProvider, setSttProvider] = useSyncedPreferences<STTProvider>('zetora-stt-provider', 'elevenlabs');
  const [sttCustomProviderId, setSttCustomProviderId] = useSyncedPreferences<string>(
    'zetora-stt-custom-provider-id',
    '',
  );
  const [sttOpenAIModel, setSttOpenAIModel] = useSyncedPreferences<string>('zetora-stt-openai-model', 'whisper-1');

  const [imageGenCustomProviderId, setImageGenCustomProviderId] = useSyncedPreferences<string>(
    'zetora-image-gen-custom-provider-id',
    '',
  );
  const [imageGenModel, setImageGenModel] = useSyncedPreferences<string>('zetora-image-gen-model', '');
  const [imageGenRequestBody, setImageGenRequestBody] = useSyncedPreferences<string>(
    'zetora-image-gen-request-body',
    '',
  );
  const [imageEditCustomProviderId, setImageEditCustomProviderId] = useSyncedPreferences<string>(
    'zetora-image-edit-custom-provider-id',
    '',
  );
  const [imageEditModel, setImageEditModel] = useSyncedPreferences<string>('zetora-image-edit-model', '');
  const [imageEditRequestBody, setImageEditRequestBody] = useSyncedPreferences<string>(
    'zetora-image-edit-request-body',
    '',
  );

  const [imageGenSystemPrompt, setImageGenSystemPrompt] = useSyncedPreferences<string>(
    'zetora-image-gen-system-prompt',
    '',
  );
  const [imageGenPromptPresets, setImageGenPromptPresets] = useSyncedPreferences<ImageGenPromptPreset[]>(
    'zetora-image-gen-prompt-presets',
    [],
  );
  const [selectedImageGenPresetId, setSelectedImageGenPresetId] = useState('');
  const [newImageGenPresetName, setNewImageGenPresetName] = useState('');

  const [imageEditSystemPrompt, setImageEditSystemPrompt] = useSyncedPreferences<string>(
    'zetora-image-edit-system-prompt',
    '',
  );
  const [imageEditPromptPresets, setImageEditPromptPresets] = useSyncedPreferences<ImageGenPromptPreset[]>(
    'zetora-image-edit-prompt-presets',
    [],
  );
  const [selectedImageEditPresetId, setSelectedImageEditPresetId] = useState('');
  const [newImageEditPresetName, setNewImageEditPresetName] = useState('');

  const imageGenRequestBodyError = useMemo(() => {
    if (!imageGenRequestBody.trim()) return null;
    try {
      JSON.parse(imageGenRequestBody);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [imageGenRequestBody]);
  const imageEditRequestBodyError = useMemo(() => {
    if (!imageEditRequestBody.trim()) return null;
    try {
      JSON.parse(imageEditRequestBody);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [imageEditRequestBody]);

  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  // Customize state: enabled sources and preferred models
  const dynamicGroups = useMemo(() => getSearchGroups(searchProvider), [searchProvider]);
  const [visibleModesLegacy] = useSyncedPreferences<string[]>('zetora-visible-modes', []);
  const [enabledSourcesPref, setEnabledSources] = useSyncedPreferences<string[]>('zetora-enabled-sources', []);
  // Fall back to the pre-migration key so existing curation isn't silently reset to "all enabled".
  const enabledSources =
    enabledSourcesPref.length > 0
      ? enabledSourcesPref
      : visibleModesLegacy.filter((id) => SOURCE_CATALOG_IDS.includes(id));
  const [preferredModels, setPreferredModels] = useSyncedPreferences<string[]>('zetora-preferred-models', []);

  const sourceCatalog = useMemo(
    () => SOURCE_CATALOG_IDS.map((id) => dynamicGroups.find((g) => g.id === id)).filter((g) => Boolean(g)),
    [dynamicGroups],
  );

  const [modelSearch, setModelSearch] = useState('');

  // Group models by provider for the customize UI
  const modelsByProvider = useMemo(() => {
    const groups = new Map<ModelProvider, typeof models>();
    for (const m of models) {
      const provider = m.provider || getModelProvider(m.value, m.label);
      if (!groups.has(provider)) groups.set(provider, []);
      groups.get(provider)!.push(m);
    }
    return groups;
  }, []);

  const filteredModelsByProvider = useMemo(() => {
    if (!modelSearch.trim()) return modelsByProvider;
    const q = modelSearch.toLowerCase();
    const filtered = new Map<ModelProvider, typeof models>();
    for (const [provider, providerModels] of modelsByProvider) {
      const matching = providerModels.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.value.toLowerCase().includes(q),
      );
      if (matching.length > 0) filtered.set(provider, matching);
    }
    return filtered;
  }, [modelsByProvider, modelSearch]);

  const enabled = isCustomInstructionsEnabled ?? true;
  const setEnabled = setIsCustomInstructionsEnabledAction ?? (() => {});

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

  // Custom Instructions queries and handlers
  const {
    data: customInstructions,
    isLoading: customInstructionsLoading,
    refetch,
  } = useQuery({
    queryKey: ['customInstructions', user?.id],
    queryFn: () => getCustomInstructions(user),
    enabled: !!user,
  });

  useEffect(() => {
    if (customInstructions?.content) {
      setContent(customInstructions.content);
    }
  }, [customInstructions]);

  const handleSave = async () => {
    if (!content.trim()) {
      sileo.error({
        title: 'Please enter some instructions',
        description: 'Custom instructions cannot be empty',
        icon: <AlertCircle className="h-4 w-4" />,
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveCustomInstructions(content);
      if (result.success) {
        sileo.success({
          title: 'Custom instructions saved successfully',
          description: 'Your preferences have been updated',
          icon: <Save className="h-4 w-4" />,
        });
        refetch();
      } else {
        sileo.error({
          title: result.error || 'Failed to save instructions',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to save instructions',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      const result = await deleteCustomInstructionsAction();
      if (result.success) {
        sileo.success({
          title: 'Custom instructions deleted successfully',
          description: 'Your custom instructions have been removed',
          icon: <Trash2 className="h-4 w-4" />,
        });
        setContent('');
        refetch();
      } else {
        sileo.error({
          title: result.error || 'Failed to delete instructions',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to delete instructions',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setIsSaving(false);
    }
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
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              {/* Theme */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Choose a theme for the app</p>
                </div>
                <ThemeSwitcher />
              </div>

              {/* Custom Instructions toggle */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Custom Instructions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Personalise how the AI responds to you</p>
                </div>
                <Switch id="enable-instructions" checked={enabled} onCheckedChange={setEnabled} />
              </div>

              {/* Custom Instructions editor - inline expand */}
              {enabled && (
                <div className="py-3.5 space-y-2.5">
                  {customInstructionsLoading ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : (
                    <Textarea
                      id="instructions"
                      placeholder="e.g. 'Always provide code examples' or 'Keep responses concise and practical'"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[80px] resize-y text-sm rounded-lg border-border/60"
                      style={{ maxHeight: '25dvh' }}
                      onFocus={(e) => {
                        try {
                          e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                        } catch {}
                      }}
                      disabled={isSaving}
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || !content.trim() || customInstructionsLoading}
                      size="sm"
                      className="h-7 text-xs rounded-lg px-3"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                          Saving
                        </>
                      ) : (
                        <>
                          <FloppyDiskIcon className="w-3 h-3 mr-1.5" />
                          Save
                        </>
                      )}
                    </Button>
                    {customInstructions && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleDelete}
                        disabled={isSaving || customInstructionsLoading}
                        size="sm"
                        className="h-7 px-2 rounded-lg"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </Button>
                    )}
                    {customInstructions && !customInstructionsLoading && (
                      <span className="text-[11px] text-muted-foreground/50 ml-auto">
                        Updated {new Date(customInstructions.updatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Location Metadata toggle */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Location Metadata</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Include approximate location for location-aware answers
                  </p>
                </div>
                <Switch
                  id="location-metadata"
                  checked={locationMetadataEnabled}
                  onCheckedChange={setLocationMetadataEnabled}
                />
              </div>

              {/* Anonymization layer */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    Anonymization
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mask names, companies, and other PII (regex + NER) before sending anything to cloud providers or
                    search tools. Applies to all built-in providers; custom providers use their own toggle above.
                  </p>
                </div>
                <Switch
                  id="anonymization-enabled"
                  checked={anonymizationEnabled}
                  onCheckedChange={setAnonymizationEnabled}
                />
              </div>

              {anonymizationEnabled && (
                <>
                  <div className="py-3.5 gap-2 flex flex-col">
                    <p className="text-sm font-medium">Always mask these terms</p>
                    <p className="text-xs text-muted-foreground -mt-1.5">
                      Client or project names the detector might miss — comma-separated
                    </p>
                    <Input
                      value={anonymizationCustomTermsInput}
                      onChange={(e) => setAnonymizationCustomTermsInput(e.target.value)}
                      onBlur={() =>
                        setAnonymizationCustomTerms(
                          anonymizationCustomTermsInput
                            .split(',')
                            .map((term) => term.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="Acme Corp, Project Nightingale"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between py-3.5 gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Automatic detection (NER)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Off masks only the always-mask list and structured patterns (email, phone, IBAN, IP, URL) —
                        public entities (e.g. company names) stay in clear text, keeping web search usable.
                      </p>
                    </div>
                    <Switch
                      id="anonymization-ner-enabled"
                      checked={anonymizationNerEnabled}
                      onCheckedChange={setAnonymizationNerEnabled}
                    />
                  </div>

                  {anonymizationNerEnabled && (
                    <div className="flex items-center justify-between py-3.5 gap-6">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Detection language</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Language the NER model expects</p>
                      </div>
                      <Select
                        value={anonymizationLanguage}
                        onValueChange={(v) => setAnonymizationLanguage(v as 'en' | 'fr')}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="fr">Français</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-3.5 gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Fail open on detector outage</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        If off (recommended), cloud requests are blocked when the PII detector is unreachable instead
                        of risking cleartext leaking through
                      </p>
                    </div>
                    <Switch
                      id="anonymization-fail-open"
                      checked={anonymizationFailOpen}
                      onCheckedChange={setAnonymizationFailOpen}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Scroll to Latest Turn</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Jump to the newest messages when opening existing chats
                  </p>
                </div>
                <Switch
                  id="scroll-to-latest-on-open"
                  checked={scrollToLatestOnOpen}
                  onCheckedChange={setScrollToLatestOnOpen}
                />
              </div>
            </div>
          </div>
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
        {preferencesTab === 'voice' && (
          <div className="mt-4">
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
              {/* ── TTS Provider ── */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Voice TTS Provider</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Engine used for voice synthesis</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-[220px] h-8 text-xs rounded-lg shrink-0 justify-between font-normal"
                    >
                      {getTTSProviderConfig(ttsProvider)?.label ?? 'ElevenLabs'}
                      <ChevronDown className="size-3.5 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[300px]">
                    <DropdownMenuRadioGroup value={ttsProvider} onValueChange={(v) => setTtsProvider(v as TTSProvider)}>
                      {TTS_PROVIDERS.map((p) => (
                        <DropdownMenuRadioItem key={p.value} value={p.value} className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-medium">{p.label}</span>
                            <span className="text-[10px] text-muted-foreground">{p.description}</span>
                          </div>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* ── Custom TTS config ── */}
              {ttsProvider === 'openai-compatible' && (
                <div className="py-3.5 space-y-2.5">
                  <p className="text-xs text-muted-foreground font-medium">Custom TTS Server</p>
                  {customProviders.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/60">
                      Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1 col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Provider</Label>
                        <Select value={ttsCustomProviderId} onValueChange={setTtsCustomProviderId}>
                          <SelectTrigger className="h-7 text-xs rounded-md">
                            <SelectValue placeholder="Select a provider…" />
                          </SelectTrigger>
                          <SelectContent>
                            {customProviders.map((cp) => (
                              <SelectItem key={cp.id} value={cp.id} className="text-xs">
                                {cp.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Model name</Label>
                        <Input
                          value={ttsOpenAIModel}
                          onChange={(e) => setTtsOpenAIModel(e.target.value)}
                          placeholder="qwen3-tts"
                          className="h-7 text-xs rounded-md"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Voice ID</Label>
                        <Input
                          value={ttsOpenAIVoice}
                          onChange={(e) => setTtsOpenAIVoice(e.target.value)}
                          placeholder="af_bella"
                          className="h-7 text-xs rounded-md"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Language</Label>
                        <Input
                          value={ttsOpenAILanguage}
                          onChange={(e) => setTtsOpenAILanguage(e.target.value)}
                          placeholder="French"
                          className="h-7 text-xs rounded-md"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── STT Provider ── */}
              <div className="flex items-center justify-between py-3.5 gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Voice STT Provider</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Engine used for speech transcription</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-[220px] h-8 text-xs rounded-lg shrink-0 justify-between font-normal"
                    >
                      {getSTTProviderConfig(sttProvider)?.label ?? 'ElevenLabs'}
                      <ChevronDown className="size-3.5 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[300px]">
                    <DropdownMenuRadioGroup value={sttProvider} onValueChange={(v) => setSttProvider(v as STTProvider)}>
                      {STT_PROVIDERS.map((p) => (
                        <DropdownMenuRadioItem key={p.value} value={p.value} className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-medium">{p.label}</span>
                            <span className="text-[10px] text-muted-foreground">{p.description}</span>
                          </div>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* ── Custom STT config ── */}
              {sttProvider === 'openai-compatible' && (
                <div className="py-3.5 space-y-2.5">
                  <p className="text-xs text-muted-foreground font-medium">Custom STT Server</p>
                  {customProviders.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/60">
                      Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1 col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Provider</Label>
                        <Select value={sttCustomProviderId} onValueChange={setSttCustomProviderId}>
                          <SelectTrigger className="h-7 text-xs rounded-md">
                            <SelectValue placeholder="Select a provider…" />
                          </SelectTrigger>
                          <SelectContent>
                            {customProviders.map((cp) => (
                              <SelectItem key={cp.id} value={cp.id} className="text-xs">
                                {cp.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Model name</Label>
                        <Input
                          value={sttOpenAIModel}
                          onChange={(e) => setSttOpenAIModel(e.target.value)}
                          placeholder="whisper-1"
                          className="h-7 text-xs rounded-md"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Image Generation Provider ── */}
              <div className="flex flex-col gap-1.5 py-3.5 border-t border-border/40">
                <p className="text-sm font-medium">Image Generation</p>
                <p className="text-xs text-muted-foreground">
                  Custom OpenAI-compatible server for <code className="text-[11px]">/v1/images/generations</code> —
                  Max subscribers only
                </p>
              </div>
              <div className="py-3.5 space-y-2.5">
                {customProviders.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60">
                    Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Provider</Label>
                      <Select value={imageGenCustomProviderId} onValueChange={setImageGenCustomProviderId}>
                        <SelectTrigger className="h-7 text-xs rounded-md">
                          <SelectValue placeholder="Select a provider…" />
                        </SelectTrigger>
                        <SelectContent>
                          {customProviders.map((cp) => (
                            <SelectItem key={cp.id} value={cp.id} className="text-xs">
                              {cp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Model name</Label>
                      <Input
                        value={imageGenModel}
                        onChange={(e) => setImageGenModel(e.target.value)}
                        placeholder="dall-e-3"
                        className="h-7 text-xs rounded-md"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Extra request body (JSON)</Label>
                      <Textarea
                        value={imageGenRequestBody}
                        onChange={(e) => setImageGenRequestBody(e.target.value)}
                        placeholder='{"quality": "hd"}'
                        rows={6}
                        className="text-xs rounded-md font-mono resize-y min-h-24"
                      />
                      {imageGenRequestBodyError && (
                        <p className="text-[10px] text-red-500 flex items-center gap-1">
                          <AlertCircle className="size-3 shrink-0" />
                          Invalid JSON — this field is ignored until fixed: {imageGenRequestBodyError}
                        </p>
                      )}
                    </div>
                    <ImagePromptPresetEditor
                      skillLabel="image-generation"
                      defaultInstructions={IMAGE_GENERATION_DEFAULT_INSTRUCTIONS}
                      systemPrompt={imageGenSystemPrompt}
                      setSystemPrompt={setImageGenSystemPrompt}
                      presets={imageGenPromptPresets}
                      setPresets={setImageGenPromptPresets}
                      selectedPresetId={selectedImageGenPresetId}
                      setSelectedPresetId={setSelectedImageGenPresetId}
                      newPresetName={newImageGenPresetName}
                      setNewPresetName={setNewImageGenPresetName}
                    />
                  </div>
                )}
              </div>

              {/* ── Image Editing Provider ── */}
              <div className="flex flex-col gap-1.5 py-3.5 border-t border-border/40">
                <p className="text-sm font-medium">Image Editing</p>
                <p className="text-xs text-muted-foreground">
                  Custom OpenAI-compatible server for <code className="text-[11px]">/v1/images/edits</code> — Max
                  subscribers only
                </p>
              </div>
              <div className="py-3.5 space-y-2.5">
                {customProviders.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60">
                    Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Provider</Label>
                      <Select value={imageEditCustomProviderId} onValueChange={setImageEditCustomProviderId}>
                        <SelectTrigger className="h-7 text-xs rounded-md">
                          <SelectValue placeholder="Select a provider…" />
                        </SelectTrigger>
                        <SelectContent>
                          {customProviders.map((cp) => (
                            <SelectItem key={cp.id} value={cp.id} className="text-xs">
                              {cp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Model name</Label>
                      <Input
                        value={imageEditModel}
                        onChange={(e) => setImageEditModel(e.target.value)}
                        placeholder="dall-e-2"
                        className="h-7 text-xs rounded-md"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Extra request body (JSON)</Label>
                      <Textarea
                        value={imageEditRequestBody}
                        onChange={(e) => setImageEditRequestBody(e.target.value)}
                        placeholder='{"size": "1024x1024"}'
                        rows={6}
                        className="text-xs rounded-md font-mono resize-y min-h-24"
                      />
                      {imageEditRequestBodyError && (
                        <p className="text-[10px] text-red-500 flex items-center gap-1">
                          <AlertCircle className="size-3 shrink-0" />
                          Invalid JSON — this field is ignored until fixed: {imageEditRequestBodyError}
                        </p>
                      )}
                    </div>
                    <ImagePromptPresetEditor
                      skillLabel="image-editing"
                      defaultInstructions={IMAGE_EDITING_DEFAULT_INSTRUCTIONS}
                      systemPrompt={imageEditSystemPrompt}
                      setSystemPrompt={setImageEditSystemPrompt}
                      presets={imageEditPromptPresets}
                      setPresets={setImageEditPromptPresets}
                      selectedPresetId={selectedImageEditPresetId}
                      setSelectedPresetId={setSelectedImageEditPresetId}
                      newPresetName={newImageEditPresetName}
                      setNewPresetName={setNewImageEditPresetName}
                    />
                  </div>
                )}
              </div>

              {/* ── Voice Backend (cloud vs local speech-to-speech) ── */}
              {voiceEnabled && (
                <div className="flex items-center justify-between py-3.5 border-t border-border/40 gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Voice Backend</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Speech-to-speech engine used by the Voice page
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-[220px] h-8 text-xs rounded-lg shrink-0 justify-between font-normal"
                      >
                        {getVoiceS2SBackendConfig(voiceS2SBackend)?.label ?? 'Cloud (xAI Realtime)'}
                        <ChevronDown className="size-3.5 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[300px]">
                      <DropdownMenuRadioGroup
                        value={voiceS2SBackend}
                        onValueChange={(v) => setVoiceS2SBackend(v as VoiceS2SBackend)}
                      >
                        {VOICE_S2S_BACKENDS.map((b) => (
                          <DropdownMenuRadioItem key={b.value} value={b.value} className="text-xs">
                            <div className="flex flex-col">
                              <span className="font-medium">{b.label}</span>
                              <span className="text-[10px] text-muted-foreground">{b.description}</span>
                            </div>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {voiceEnabled && voiceS2SBackend === 'local' && (
                <p className="text-[11px] text-muted-foreground/60 pb-3.5">
                  Uses the model picked in the chat model selector, plus the STT/TTS providers configured above.
                </p>
              )}
            </div>
          </div>
        )}

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
                  Turning all of these off means retrieve fails outright instead of falling through to a method you
                  did not ask for.
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
                    placeholder="Name (e.g. Ollama Local)"
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
        {preferencesTab === 'customize' && (
          <div className="mt-4 space-y-5">
            {/* Sources - toggle which tools the model can use */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Sources</p>
                  <p className="text-[11px] text-muted-foreground/50">
                    Tools the AI can use on every message. All enabled when none selected.
                  </p>
                </div>
                {enabledSources.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 rounded-md"
                    onClick={() => setEnabledSources([])}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="rounded-xl border border-border/60 divide-y divide-border/40 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20">
                {sourceCatalog.map((group) => {
                  if (!group) return null;
                  const isEnabled = enabledSources.length === 0 || enabledSources.includes(group.id);
                  const GroupIcon = group.icon as unknown as ComponentType<{
                    width?: number;
                    height?: number;
                    className?: string;
                  }>;
                  const isComponentIcon = typeof group.icon === 'function';
                  return (
                    <div key={group.id} className="flex items-center justify-between py-2.5 px-3 gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isComponentIcon ? (
                          <GroupIcon width={14} height={14} className="shrink-0 text-muted-foreground" />
                        ) : (
                          <HugeiconsIcon
                            icon={group.icon as any}
                            size={14}
                            color="currentColor"
                            className="shrink-0 text-muted-foreground"
                          />
                        )}
                        <span className="text-xs font-medium truncate">{group.name}</span>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => {
                          const base = enabledSources.length === 0 ? sourceCatalog.map((g) => g!.id) : enabledSources;
                          if (checked) {
                            setEnabledSources([...base, group.id]);
                          } else {
                            const next = base.filter((id) => id !== group.id);
                            setEnabledSources(next);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Models - select preferred */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Preferred Models</p>
                  <p className="text-[11px] text-muted-foreground/50">
                    Select models to show in the picker. All shown when none selected.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {preferredModels.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 rounded-md"
                      onClick={() => setPreferredModels([])}
                    >
                      Clear ({preferredModels.length})
                    </Button>
                  )}
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="h-8 text-xs rounded-lg pl-8"
                />
              </div>

              {/* Scrollable model list grouped by provider */}
              <div className="rounded-xl border border-border/60 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20">
                {Array.from(filteredModelsByProvider.entries()).map(([provider, providerModels]) => (
                  <div key={provider}>
                    {/* Provider header */}
                    <div className="sticky top-0 bg-background/95 backdrop-blur px-4 py-2 border-b border-border/30">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {PROVIDERS[provider]?.name || provider}
                        <span className="text-muted-foreground/40 ml-1.5 font-normal normal-case tracking-normal">
                          {providerModels.filter((m) => preferredModels.includes(m.value)).length > 0 &&
                            `${providerModels.filter((m) => preferredModels.includes(m.value)).length} selected`}
                        </span>
                      </p>
                    </div>
                    {/* Model rows */}
                    <div className="divide-y divide-border/30">
                      {providerModels.map((m) => {
                        const isSelected = preferredModels.includes(m.value);
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                const next = preferredModels.filter((id) => id !== m.value);
                                setPreferredModels(next);
                              } else {
                                setPreferredModels([...preferredModels, m.value]);
                              }
                            }}
                            className={cn(
                              'w-full flex items-center justify-between py-2 px-4 gap-4 text-left transition-colors',
                              'hover:bg-accent/40',
                              isSelected && 'bg-primary/5',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium truncate">{m.label}</span>
                                {m.pro && (
                                  <span className="font-pixel text-[11px] text-muted-foreground/50 uppercase tracking-wider shrink-0">
                                    Pro
                                  </span>
                                )}
                                {m.isNew && (
                                  <span className="text-[7px] bg-primary/10 text-primary px-1 py-0.5 rounded font-medium shrink-0">
                                    New
                                  </span>
                                )}
                              </div>
                            </div>
                            <div
                              className={cn(
                                'h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                                isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border/60',
                              )}
                            >
                              {isSelected && (
                                <svg
                                  className="h-3 w-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {filteredModelsByProvider.size === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-xs text-muted-foreground">No models match your search.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

