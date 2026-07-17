'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  useSyncedPreferences,
  type PreferenceKey,
  type ImageGenPromptPreset,
} from '@/hooks/use-synced-preferences';
import {
  IMAGE_GENERATION_DEFAULT_INSTRUCTIONS,
  IMAGE_EDITING_DEFAULT_INSTRUCTIONS,
} from '@/lib/skills/image-prompt-defaults';
import {
  getUserMessageCount,
  getSubDetails,
  getExtremeSearchUsageCount,
  getAgentModeUsageCountAction,
  getAnthropicUsageCountAction,
  getGoogleUsageCountAction,
  getHistoricalUsage,
  getCustomInstructions,
  saveCustomInstructions,
  deleteCustomInstructionsAction,
  createConnectorAction,
  listUserConnectorsAction,
  deleteConnectorAction,
  manualSyncConnectorAction,
  getConnectorSyncStatusAction,
  testEmailDelivery,
} from '@/app/actions';
import { AGENT_MODE_MONTHLY_LIMIT, SEARCH_LIMITS } from '@/lib/constants';
import { authClient, betterauthClient } from '@/lib/auth-client';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import {
  MagnifyingGlassIcon,
  LightningIcon,
  CalendarIcon,
  TrashIcon,
  FloppyDiskIcon,
  ArrowClockwiseIcon,
  RobotIcon,
} from '@phosphor-icons/react';

import {
  ChevronDown,
  ExternalLink,
  GripVertical,
  Sparkles,
  Check,
  X,
  AlertCircle,
  Settings,
  Trash2,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback, useRef, type ComponentType } from 'react';
import { allSettled as betterAllSettled } from 'better-all';
import { sileo } from 'sileo';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { getAllMemories, deleteMemory, MemoryItem } from '@/lib/memory-actions';
import {
  Loader2,
  Search,
  Zap,
  ZapOff,
  Pencil,
  Plus,
  MoreHorizontal,
  Link2Off,
  HardDrive,
  Timer,
  CheckCircle2,
  XCircle,
  Mail,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { getSearchGroups, type SearchGroupId } from '@/lib/utils';
import { models, PROVIDERS, getModelProvider, type ModelProvider, type Model } from '@/ai/models';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { useIsProUser } from '@/contexts/user-context';
import { ZetoraLogo } from './logos/zetora-logo';
import { ThemeSwitcher } from './theme-switcher';
import Image from 'next/image';
import { SKILL_CATALOG } from '@/lib/skills/catalog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import {
  Crown02Icon,
  UserAccountIcon,
  Analytics01Icon,
  Settings02Icon,
  Brain02Icon,
  GlobalSearchIcon,
  ConnectIcon,
  InformationCircleIcon,
  Rocket01Icon,
  Attachment01Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { CONNECTOR_CONFIGS, CONNECTOR_ICONS, type ConnectorProvider } from '@/lib/connectors';
import { TTS_PROVIDERS, type TTSProvider, getTTSProviderConfig } from '@/lib/tts-providers';
import { STT_PROVIDERS, type STTProvider, getSTTProviderConfig } from '@/lib/stt-providers';
import { VOICE_S2S_BACKENDS, type VoiceS2SBackend, getVoiceS2SBackendConfig } from '@/lib/s2s-backends';
// Custom visx-based chart components
import { AreaChart as CustomAreaChart } from '@/components/charts/area-chart';
import { Area as CustomArea } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip as CustomChartTooltip } from '@/components/charts/tooltip';
import type { TooltipRow } from '@/components/charts/tooltip/tooltip-content';
import { Input } from '@/components/ui/input';
import { ModelSelectorDialog } from '@/components/ui/model-selector';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  subscriptionData?: any;
  isProUser?: boolean;
  isProStatusLoading?: boolean;
  isCustomInstructionsEnabled?: boolean;
  setIsCustomInstructionsEnabledAction?: (value: boolean | ((val: boolean) => boolean)) => void;
  initialTab?: string;
}

// Component for Profile Information
export function ProfileSection({ user, subscriptionData, isProUser, isProStatusLoading }: any) {
  const { isProUser: fastProStatus, isLoading: fastProLoading } = useIsProUser();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Use comprehensive Pro status from user data (includes both Polar + DodoPayments)
  const isProUserActive: boolean = user?.isProUser || fastProStatus || false;
  const showProLoading: boolean = Boolean(fastProLoading || isProStatusLoading);

  return (
    <div className="space-y-5">
      {/* Profile Header */}
      <div className={cn('flex items-center gap-4', isMobile ? 'pb-2' : 'pb-3')}>
        <Avatar
          className={cn(
            'ring-2 ring-border/50 ring-offset-2 ring-offset-background',
            isMobile ? 'h-16 w-16' : 'h-20 w-20',
          )}
        >
          <AvatarImage src={user?.image || ''} />
          <AvatarFallback className={isMobile ? 'text-base' : 'text-lg'}>
            {user?.name
              ? user.name
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()
              : 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={cn('font-semibold truncate', isMobile ? 'text-base' : 'text-lg')}>{user?.name}</h3>
            {showProLoading ? (
              <Skeleton className="h-5 w-12" />
            ) : (
              isProUserActive && (
                <span
                  className={cn(
                    'font-baumans! px-2 pt-0.5 pb-1.5 inline-flex leading-4 items-center rounded-lg shadow-sm border-transparent ring-1 ring-ring/35 ring-offset-1 ring-offset-background text-xs shrink-0',
                    'bg-linear-to-br from-secondary/25 via-primary/20 to-accent/25 text-foreground',
                    'dark:bg-linear-to-br dark:from-primary dark:via-secondary dark:to-primary dark:text-foreground',
                  )}
                >
                  {user?.isMaxUser ? 'max' : 'pro'}
                </span>
              )
            )}
          </div>
          <p className={cn('text-muted-foreground break-all', isMobile ? 'text-xs' : 'text-sm')}>{user?.email}</p>
        </div>
      </div>

      {/* Account Details */}
      <div className={isMobile ? 'space-y-2.5' : 'space-y-3'}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">01</span>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Details</h4>
        </div>
        <div
          className={cn(
            'rounded-lg border border-border/60',
            isMobile ? 'divide-y divide-border/40' : 'divide-y divide-border/40',
          )}
        >
          <div className={cn(isMobile ? 'p-3' : 'p-4')}>
            <Label className="font-pixel text-xs text-muted-foreground/50 uppercase tracking-[0.12em]">Full Name</Label>
            <p className="text-sm font-medium mt-1">{user?.name || 'Not provided'}</p>
          </div>
          <div className={cn(isMobile ? 'p-3' : 'p-4')}>
            <Label className="font-pixel text-xs text-muted-foreground/50 uppercase tracking-[0.12em]">
              Email Address
            </Label>
            <p className="text-sm font-medium mt-1 break-all">{user?.email || 'Not provided'}</p>
          </div>
        </div>

        <div className={cn('rounded-lg bg-muted/30 border border-border/40', isMobile ? 'p-2.5' : 'p-3')}>
          <p className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-xs')}>
            Profile information is managed through your authentication provider. Contact support to update your details.
          </p>
        </div>
      </div>
    </div>
  );
}

// Icon components for search providers
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

// Component for Usage Information
type TimePeriod = '7d' | '30d' | '12m';

export function UsageSection({ user }: any) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7d');

  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
  const isProUser = user?.isProUser;

  // Convert time period to days
  const daysWindow = useMemo(() => {
    switch (timePeriod) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '12m':
        return 365; // 12 months
      default:
        return 7;
    }
  }, [timePeriod]);

  const {
    data: usageData,
    isLoading: usageLoading,
    error: usageError,
    refetch: refetchUsageData,
  } = useQuery({
    queryKey: ['usageData'],
    queryFn: async () => {
      const {
        searchCount,
        extremeSearchCount,
        agentModeUsageCount,
        anthropicUsageCount,
        googleUsageCount,
        subscriptionDetails,
      } = await all(
        {
          async searchCount() {
            return getUserMessageCount();
          },
          async extremeSearchCount() {
            return getExtremeSearchUsageCount();
          },
          async agentModeUsageCount() {
            return getAgentModeUsageCountAction();
          },
          async anthropicUsageCount() {
            return getAnthropicUsageCountAction();
          },
          async googleUsageCount() {
            return getGoogleUsageCountAction();
          },
          async subscriptionDetails() {
            return getSubDetails();
          },
        },
        getBetterAllOptions(),
      );

      return {
        searchCount,
        extremeSearchCount,
        agentModeUsageCount,
        anthropicUsageCount,
        googleUsageCount,
        subscriptionDetails,
      };
    },
    staleTime: 1000 * 60 * 3,
    enabled: !!user,
  });

  const {
    data: historicalUsageData,
    isLoading: historicalLoading,
    refetch: refetchHistoricalData,
  } = useQuery({
    queryKey: ['historicalUsage', user?.id, daysWindow],
    queryFn: () => getHistoricalUsage(user, daysWindow),
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  const searchCount = usageData?.searchCount;
  const extremeSearchCount = usageData?.extremeSearchCount;
  const agentModeUsageCount = usageData?.agentModeUsageCount;
  const anthropicUsageCount = usageData?.anthropicUsageCount;
  const googleUsageCount = usageData?.googleUsageCount;

  // Transform historical data for chart (Date objects for visx)
  const chartData = useMemo(() => {
    if (!historicalUsageData || historicalUsageData.length === 0) return [];

    // For 12m, group by week; for others, use daily data
    if (timePeriod === '12m') {
      // Group by week for 12 months view
      const weeklyData = new Map<string, { total: number; count: number }>();

      historicalUsageData.forEach((item) => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        const weekKey = weekStart.toISOString().split('T')[0];

        const existing = weeklyData.get(weekKey) || { total: 0, count: 0 };
        weeklyData.set(weekKey, {
          total: existing.total + item.count,
          count: existing.count + 1,
        });
      });

      return Array.from(weeklyData.entries())
        .map(([dateStr, data]) => ({
          date: new Date(dateStr),
          messages: data.total,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    } else {
      // Use daily data for 7d and 30d
      return historicalUsageData
        .map((item) => ({
          date: new Date(item.date),
          messages: item.count,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }
  }, [historicalUsageData, timePeriod]);

  const handleRefreshUsage = async () => {
    try {
      setIsRefreshing(true);
      await all(
        {
          async usage() {
            return refetchUsageData();
          },
          async historical() {
            return refetchHistoricalData();
          },
        },
        getBetterAllOptions(),
      );
      sileo.success({
        title: 'Usage data refreshed',
        description: 'Your usage statistics are up to date',
        icon: <Check className="h-4 w-4" />,
      });
    } catch (error) {
      sileo.error({
        title: 'Failed to refresh usage data',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const usagePercentage = isProUser
    ? 0
    : Math.min(((searchCount?.count || 0) / SEARCH_LIMITS.DAILY_SEARCH_LIMIT) * 100, 100);

  const extremePercentage = isProUser
    ? 0
    : Math.min(((extremeSearchCount?.count || 0) / SEARCH_LIMITS.EXTREME_SEARCH_LIMIT) * 100, 100);

  const anthropicPercentage = user?.isMaxUser ? Math.min(((anthropicUsageCount?.count || 0) / 60) * 100, 100) : 0;
  const googlePercentage = user?.isMaxUser ? Math.min(((googleUsageCount?.count || 0) / 80) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      {/* Stat cards + limits in one card */}
      <div className="rounded-xl border border-border/60 divide-y divide-border/40">
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs text-muted-foreground font-medium">Today&apos;s Usage</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshUsage}
            disabled={isRefreshing}
            className="h-6 w-6 p-0 rounded-md"
          >
            {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowClockwiseIcon className="h-3 w-3" />}
          </Button>
        </div>

        {/* Stat row: searches + extreme + anthropic + google */}
        <div className={cn('divide-border/40', user?.isMaxUser ? 'grid grid-cols-4' : 'grid grid-cols-2')}>
          <div className="px-4 py-3 border-r border-border/40">
            <div className="flex items-center gap-1.5 mb-1">
              <MagnifyingGlassIcon className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground">Searches</span>
            </div>
            {usageLoading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums">{searchCount?.count || 0}</span>
                {!isProUser && (
                  <span className="text-[10px] text-muted-foreground">/ {SEARCH_LIMITS.DAILY_SEARCH_LIMIT}</span>
                )}
              </div>
            )}
          </div>
          <div className={cn('px-4 py-3', user?.isMaxUser && 'border-r border-border/40')}>
            <div className="flex items-center gap-1.5 mb-1">
              <LightningIcon className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground">Extreme</span>
            </div>
            {usageLoading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums">{extremeSearchCount?.count || 0}</span>
                {!isProUser && (
                  <span className="text-[10px] text-muted-foreground">/ {SEARCH_LIMITS.EXTREME_SEARCH_LIMIT} mo</span>
                )}
              </div>
            )}
          </div>
          {user?.isMaxUser && (
            <div className="px-4 py-3 border-r border-border/40">
              <div className="flex items-center gap-1.5 mb-1">
                <RobotIcon className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground">Anthropic</span>
              </div>
              {usageLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums">{anthropicUsageCount?.count || 0}</span>
                  <span className="text-[10px] text-muted-foreground">/ 60 wk</span>
                </div>
              )}
            </div>
          )}
          {user?.isMaxUser && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <RobotIcon className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground">Gemini</span>
              </div>
              {usageLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums">{googleUsageCount?.count || 0}</span>
                  <span className="text-[10px] text-muted-foreground">/ 80 mo</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Limit bars */}
        {!usageLoading && ((!isProUser && !user?.isMaxUser) || user?.isMaxUser) && (
          <div className="px-4 py-3 space-y-3">
            {!isProUser && !user?.isMaxUser && (
              <>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Daily limit</span>
                    <span className="text-muted-foreground tabular-nums">
                      {Math.max(0, SEARCH_LIMITS.DAILY_SEARCH_LIMIT - (searchCount?.count || 0))} left
                    </span>
                  </div>
                  <Progress value={usagePercentage} className="h-1 [&>div]:transition-none" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Monthly extreme</span>
                    <span className="text-muted-foreground tabular-nums">
                      {Math.max(0, SEARCH_LIMITS.EXTREME_SEARCH_LIMIT - (extremeSearchCount?.count || 0))} left
                    </span>
                  </div>
                  <Progress value={extremePercentage} className="h-1 [&>div]:transition-none" />
                </div>
              </>
            )}

            {user?.isMaxUser && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Anthropic weekly limit</span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.max(0, 60 - (anthropicUsageCount?.count || 0))} left
                  </span>
                </div>
                <Progress value={anthropicPercentage} className="h-1 [&>div]:transition-none" />
                <div className="flex justify-between text-[11px] pt-1">
                  <span className="text-muted-foreground">Gemini monthly limit</span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.max(0, 80 - (googleUsageCount?.count || 0))} left
                  </span>
                </div>
                <Progress value={googlePercentage} className="h-1 [&>div]:transition-none" />

                {/* Agent mode monthly limit — hidden for now
                {(() => {
                  const agentUsed = agentModeUsageCount?.count || 0;
                  const agentLeft = Math.max(0, AGENT_MODE_MONTHLY_LIMIT - agentUsed);
                  const dangerThreshold = 10;
                  const warningThreshold = 25;
                  const ringColor: 'primary' | 'warning' | 'success' | 'danger' =
                    agentLeft <= dangerThreshold
                      ? 'danger'
                      : agentLeft <= warningThreshold
                        ? 'warning'
                        : 'success';

                  return (
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-muted-foreground">Agent mode monthly limit</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{agentLeft} left</span>
                      </div>

                      <div className="flex items-center justify-center">
                        <ProgressRing
                          value={agentUsed}
                          max={AGENT_MODE_MONTHLY_LIMIT}
                          size={56}
                          strokeWidth={5}
                          showLabel
                          label={`${agentLeft} left`}
                          color={ringColor}
                        />
                      </div>
                    </div>
                  );
                })()} */}
              </div>
            )}
          </div>
        )}

        {/* Upgrade CTA (free users only) */}
        {!isProUser && (
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium">Unlimited searches</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Upgrade to remove all limits</p>
            </div>
            <Button asChild size="sm" className="h-7 text-xs rounded-lg px-3 shrink-0">
              <Link href="/pricing">Upgrade</Link>
            </Button>
          </div>
        )}
      </div>

      {!usageLoading && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {/* Activity header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
            <p className="text-xs text-muted-foreground font-medium">Activity</p>
            <ButtonGroup orientation="horizontal" className="h-6">
              <Button
                variant={timePeriod === '7d' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('7d')}
                className="h-6 px-2 text-[10px]"
              >
                7d
              </Button>
              <Button
                variant={timePeriod === '30d' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('30d')}
                className="h-6 px-2 text-[10px]"
              >
                30d
              </Button>
              <Button
                variant={timePeriod === '12m' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('12m')}
                className="h-6 px-2 text-[10px]"
              >
                12m
              </Button>
            </ButtonGroup>
          </div>
          {/* Chart */}
          <div className="p-3">
            {historicalLoading ? (
              <div className="h-[200px] flex items-center justify-center opacity-60">
                <div className="text-center space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  <p className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-xs')}>
                    Loading activity data...
                  </p>
                </div>
              </div>
            ) : chartData && chartData.length > 0 ? (
              <div className="w-full min-w-0 h-[220px]">
                <CustomAreaChart
                  data={chartData}
                  xDataKey="date"
                  margin={{ top: 10, right: 10, bottom: 5, left: 10 }}
                  animationDuration={600}
                  aspectRatio="auto"
                  className="h-full w-full"
                >
                  <Grid horizontal numTicksRows={4} />
                  <CustomArea
                    dataKey="messages"
                    fill="var(--chart-1)"
                    fillOpacity={0.3}
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                  />
                  <CustomChartTooltip
                    showDatePill
                    rows={(point) => {
                      const rows: TooltipRow[] = [
                        {
                          color: 'var(--chart-1)',
                          label: 'Messages',
                          value: `${point.messages}`,
                        },
                      ];
                      return rows;
                    }}
                  />
                </CustomAreaChart>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <p className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-xs')}>No activity data</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Component for Subscription Information
export function SubscriptionSection({ subscriptionData, isProUser, user }: any) {
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Use data from user object (already cached)
  const dodoProStatus = user?.dodoProStatus || null;

  // Fetch Polar orders using React Query
  const { data: polarOrders, isLoading: polarOrdersLoading } = useQuery({
    queryKey: ['polarOrders', user?.id],
    queryFn: async () => {
      try {
        const ordersResponse = await authClient.customer.orders.list({
          fetchOptions: {
            query: {
              page: 1,
              limit: 10,
            },
          },
        });
        return ordersResponse.data;
      } catch (error) {
        console.log('Failed to fetch Polar orders:', error);
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Fetch Dodo subscriptions using React Query
  const { data: dodoSubscriptions, isLoading: dodoSubscriptionsLoading } = useQuery({
    queryKey: ['dodoSubscriptions', user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await betterauthClient.dodopayments.customer.subscriptions.list();
        if (error) {
          console.log('Failed to fetch Dodo subscriptions:', error);
          return null;
        }
        console.log('Dodo subscriptions response:', data);
        return data;
      } catch (error) {
        console.log('Failed to fetch Dodo subscriptions:', error);
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Get the most recent active dodo subscription for pricing info
  const activeDodoSub =
    user?.subscriptionHistory?.find((sub: any) => sub.status === 'active') || user?.subscriptionHistory?.[0];

  // Normalize dodo subscriptions: prefer live API data, fall back to DB subscription history
  const dodoApiList: any[] = dodoSubscriptions
    ? Array.isArray(dodoSubscriptions)
      ? dodoSubscriptions
      : dodoSubscriptions.items || []
    : [];
  const dodoList: any[] =
    dodoApiList.length > 0
      ? dodoApiList
      : (user?.subscriptionHistory || []).map((sub: any) => ({
          id: sub.id,
          created_at: sub.createdAt,
          currency: sub.currency,
          recurring_pre_tax_amount: sub.amount,
          status: sub.status,
        }));
  const polarList: any[] = getPolarOrders(polarOrders);
  const polarFallback = getPolarFallbackOrders(user);
  const polarHistory = polarList.length > 0 ? polarList : polarFallback;
  const hasAnyBillingHistory = dodoList.length > 0 || polarHistory.length > 0;

  // Format currency amount from smallest unit (cents/paise) to display string
  const formatSubAmount = (amount: number, currency: string) => {
    const code = currency?.toUpperCase() || 'USD';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount / 100);
    } catch {
      return `${(amount / 100).toFixed(2)} ${code}`;
    }
  };

  function getPolarOrders(orders: any): any[] {
    if (!orders) return [];
    if (Array.isArray(orders)) return orders;
    if (Array.isArray(orders.items)) return orders.items;
    if (Array.isArray(orders.result?.items)) return orders.result.items;
    if (Array.isArray(orders.data?.items)) return orders.data.items;
    return [];
  }

  function getPolarFallbackOrders(currentUser: any): any[] {
    const subscription = currentUser?.polarSubscription;
    if (!subscription) return [];
    const createdAt =
      subscription.currentPeriodStart ||
      subscription.createdAt ||
      subscription.current_period_start ||
      subscription.created_at ||
      null;
    return [
      {
        id: subscription.id || `polar-sub-${currentUser?.id || 'current'}`,
        createdAt,
        totalAmount: subscription.amount,
        currency: subscription.currency,
        status: subscription.status,
        product: {
          name: 'Zetora Pro',
        },
      },
    ];
  }

  function getPolarOrderDate(order: any): Date | null {
    const value = order?.createdAt ?? order?.created_at ?? order?.created;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getPolarOrderAmount(order: any): number | null {
    const value = order?.totalAmount ?? order?.total_amount ?? order?.amount_total ?? order?.amount ?? order?.total;
    return typeof value === 'number' ? value : null;
  }

  function getPolarOrderCurrency(order: any): string {
    return (order?.currency ?? order?.currency_code ?? order?.currencyCode ?? 'USD').toString();
  }

  function getPolarOrderTitle(order: any): string {
    return order?.product?.name ?? order?.product?.title ?? order?.product_name ?? order?.name ?? 'Subscription';
  }

  function getPolarOrderStatus(order: any): string {
    return (order?.status ?? order?.payment_status ?? 'recurring').toString().replace(/_/g, ' ');
  }

  const handleManageSubscription = async () => {
    // Determine the subscription source
    const getProAccessSource = () => {
      if (hasActiveSubscription) return 'polar';
      if (hasDodoProStatus) return 'dodo';
      return null;
    };

    const proSource = getProAccessSource();

    console.log('proSource', proSource);

    try {
      setIsManagingSubscription(true);

      console.log('Settings Dialog - Provider source:', proSource);
      console.log('User dodoProStatus:', user?.dodoProStatus);
      console.log('User full object keys:', Object.keys(user || {}));

      if (proSource === 'dodo') {
        // Use DodoPayments portal for DodoPayments users
        console.log('Opening DodoPayments portal');
        console.log('User object for DodoPayments:', {
          id: user?.id,
          email: user?.email,
          dodoProStatus: user?.dodoProStatus,
          isProUser: user?.isProUser,
        });
        await betterauthClient.dodopayments.customer.portal();
      } else {
        // Use Polar portal for Polar subscribers
        console.log('Opening Polar portal');
        await authClient.customer.portal({});
      }
    } catch (error) {
      console.error('Subscription management error:', error);

      if (proSource === 'dodo') {
        sileo.error({
          title: 'Unable to access DodoPayments portal',
          description: 'Please contact support at kenny@flowinit.fr',
          icon: <AlertCircle className="h-4 w-4" />,
        });
      } else {
        sileo.error({
          title: 'Failed to open subscription management',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } finally {
      setIsManagingSubscription(false);
    }
  };

  // Check for active status from either source
  const hasActiveSubscription =
    subscriptionData?.hasSubscription && subscriptionData?.subscription?.status === 'active';
  const hasDodoProStatus = dodoProStatus?.isProUser || (user?.proSource === 'dodo' && user?.isProUser);
  const isProUserActive = hasActiveSubscription || hasDodoProStatus;
  const subscription = subscriptionData?.subscription;

  // Check if DodoPayments Pro is expiring soon (within 7 days)
  const getDaysUntilExpiration = () => {
    if (!dodoProStatus?.expiresAt) return null;
    const now = new Date();
    const expiresAt = new Date(dodoProStatus.expiresAt);
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntilExpiration = getDaysUntilExpiration();
  const isExpiringSoon = daysUntilExpiration !== null && daysUntilExpiration <= 7 && daysUntilExpiration > 0;

  return (
    <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
      {isProUserActive ? (
        <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
          <div className={cn('bg-primary text-primary-foreground rounded-xl', isMobile ? 'p-4' : 'p-5')}>
            <div className={cn('flex items-start justify-between', isMobile ? 'mb-3' : 'mb-4')}>
              <div className="flex items-center gap-2.5">
                <div className={cn('bg-primary-foreground/15 rounded-lg', isMobile ? 'p-1.5' : 'p-2')}>
                  <HugeiconsIcon icon={Crown02Icon} size={isMobile ? 16 : 18} color="currentColor" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className={cn('font-semibold', isMobile ? 'text-sm' : 'text-base')}>
                    Zetora{' '}
                    <span className="font-pixel text-xs uppercase tracking-wider">
                      {user?.isMaxUser ? 'Max' : 'Pro'}
                    </span>
                  </h3>
                  <p className={cn('opacity-80', isMobile ? 'text-[10px]' : 'text-xs')}>
                    {hasActiveSubscription
                      ? subscription?.status === 'active'
                        ? 'Active subscription'
                        : subscription?.status || 'Unknown'
                      : 'Active membership'}
                  </p>
                </div>
              </div>
              <span className="font-pixel text-[11px] bg-primary-foreground/15 text-primary-foreground px-2 py-1 rounded-md uppercase tracking-wider">
                Active
              </span>
            </div>
            <div className={cn('opacity-90 mb-4', isMobile ? 'text-[11px]' : 'text-xs')}>
              <p className="mb-1.5">Unlimited access to all premium features</p>
              {hasActiveSubscription && subscription && (
                <div className="flex gap-4 text-[10px] opacity-75">
                  <span>
                    ${(subscription.amount / 100).toFixed(2)}/{subscription.recurringInterval}
                  </span>
                  <span>Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
                </div>
              )}
              {hasDodoProStatus && !hasActiveSubscription && (
                <div className="space-y-1">
                  <div className="flex gap-4 text-[10px] opacity-75">
                    <span>
                      {activeDodoSub
                        ? `${formatSubAmount(activeDodoSub.amount, activeDodoSub.currency)}/${activeDodoSub.interval?.toLowerCase() || 'month'}`
                        : 'Pro subscription'}{' '}
                      (auto-renews)
                    </span>
                  </div>
                  {dodoProStatus?.expiresAt && (
                    <div className="text-[10px] opacity-75">
                      <span>Next billing: {new Date(dodoProStatus.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {(hasActiveSubscription || hasDodoProStatus) && (
              <Button
                variant="secondary"
                onClick={handleManageSubscription}
                className={cn('w-full rounded-lg', isMobile ? 'h-8 text-xs' : 'h-9')}
                disabled={isManagingSubscription}
              >
                {isManagingSubscription ? (
                  <Loader2 className={isMobile ? 'h-3 w-3 mr-1.5' : 'h-3.5 w-3.5 mr-2'} />
                ) : (
                  <ExternalLink className={isMobile ? 'h-3 w-3 mr-1.5' : 'h-3.5 w-3.5 mr-2'} />
                )}
                {isManagingSubscription ? 'Opening...' : 'Manage Billing'}
              </Button>
            )}
          </div>

          {/* Expiration Warning for DodoPayments */}
          {isExpiringSoon && (
            <div
              className={cn(
                'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg',
                isMobile ? 'p-3' : 'p-4',
              )}
            >
              <div className="flex items-start gap-2">
                <div className={cn('bg-yellow-100 dark:bg-yellow-900/40 rounded', isMobile ? 'p-1' : 'p-1.5')}>
                  <HugeiconsIcon
                    icon={Crown02Icon}
                    size={isMobile ? 14 : 16}
                    color="currentColor"
                    strokeWidth={1.5}
                    className={cn('text-yellow-600 dark:text-yellow-500')}
                  />
                </div>
                <div className="flex-1">
                  <h4
                    className={cn(
                      'font-semibold text-yellow-800 dark:text-yellow-200',
                      isMobile ? 'text-xs' : 'text-sm',
                    )}
                  >
                    Pro Access Expiring Soon
                  </h4>
                  <p
                    className={cn(
                      'text-yellow-700 dark:text-yellow-300',
                      isMobile ? 'text-[11px] mt-1' : 'text-xs mt-1',
                    )}
                  >
                    Your Pro access expires in {daysUntilExpiration} {daysUntilExpiration === 1 ? 'day' : 'days'}. Renew
                    now to continue enjoying unlimited features.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className={cn(
                      'mt-2 bg-yellow-600 hover:bg-yellow-700 text-white',
                      isMobile ? 'h-7 text-xs' : 'h-8',
                    )}
                  >
                    <Link href="/pricing">Renew Pro Access</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
          <div
            className={cn(
              'text-center border border-dashed border-border/60 rounded-xl bg-muted/10',
              isMobile ? 'p-5' : 'p-8',
            )}
          >
            <div className="mx-auto w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
              <HugeiconsIcon
                icon={Crown02Icon}
                size={24}
                color="currentColor"
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </div>
            <h3 className={cn('font-semibold mb-1', isMobile ? 'text-sm' : 'text-base')}>No Active Plan</h3>
            <p className={cn('text-muted-foreground mb-5', isMobile ? 'text-[11px]' : 'text-xs')}>
              Upgrade to <span className="font-pixel text-xs uppercase tracking-wider">Pro</span> for unlimited access
            </p>
            <div className="space-y-2 max-w-xs mx-auto">
              <Button asChild size="sm" className={cn('w-full rounded-lg', isMobile ? 'h-9 text-xs' : 'h-10')}>
                <Link href="/pricing">
                  <HugeiconsIcon
                    icon={Crown02Icon}
                    size={isMobile ? 12 : 14}
                    color="currentColor"
                    strokeWidth={1.5}
                    className={isMobile ? 'mr-1.5' : 'mr-2'}
                  />
                  Upgrade to Pro
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn('w-full rounded-lg', isMobile ? 'h-8 text-xs' : 'h-9')}
              >
                <Link href="/pricing">Compare Plans</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
        <div className="flex items-center gap-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">02</span>
          <h4 className={cn('font-semibold', isMobile ? 'text-xs' : 'text-sm')}>Billing History</h4>
        </div>
        {polarOrdersLoading || dodoSubscriptionsLoading ? (
          <div className={cn('border rounded-lg flex items-center justify-center', isMobile ? 'p-3 h-16' : 'p-4 h-20')}>
            <Loader2 className={cn(isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4', 'animate-spin')} />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Show Dodo subscriptions */}
            {dodoList.length > 0 && (
              <>
                {dodoList.slice(0, 3).map((subscription: any) => (
                  <div key={subscription.id} className={cn('bg-muted/30 rounded-lg', isMobile ? 'p-2.5' : 'p-3')}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className={cn('font-medium truncate', isMobile ? 'text-xs' : 'text-sm')}>
                          Zetora Pro (DodoPayments)
                        </p>
                        <div className="flex items-center gap-2">
                          <p className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                            {new Date(subscription.created_at).toLocaleDateString()}
                          </p>
                          <Badge variant="secondary" className="text-[8px] px-1 py-0">
                            {subscription.currency?.toUpperCase() || 'USD'}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn('font-semibold block', isMobile ? 'text-xs' : 'text-sm')}>
                          {subscription.recurring_pre_tax_amount
                            ? formatSubAmount(subscription.recurring_pre_tax_amount, subscription.currency || 'USD')
                            : '—'}
                        </span>
                        <span className={cn('text-muted-foreground', isMobile ? 'text-[9px]' : 'text-xs')}>
                          {subscription.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Show Polar orders */}
            {polarHistory.length > 0 && (
              <>
                {polarHistory.slice(0, 3).map((order: any) => {
                  const orderDate = getPolarOrderDate(order);
                  const orderAmount = getPolarOrderAmount(order);
                  const orderCurrency = getPolarOrderCurrency(order);
                  return (
                    <div key={order.id} className={cn('bg-muted/30 rounded-lg', isMobile ? 'p-2.5' : 'p-3')}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-medium truncate', isMobile ? 'text-xs' : 'text-sm')}>
                            {getPolarOrderTitle(order)}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                              {orderDate ? orderDate.toLocaleDateString() : '—'}
                            </p>
                            <Badge variant="secondary" className="text-[8px] px-1 py-0">
                              {orderCurrency.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={cn('font-semibold block', isMobile ? 'text-xs' : 'text-sm')}>
                            {orderAmount !== null ? formatSubAmount(orderAmount, orderCurrency) : '—'}
                          </span>
                          <span className={cn('text-muted-foreground', isMobile ? 'text-[9px]' : 'text-xs')}>
                            {getPolarOrderStatus(order)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Show message if no billing history */}
            {!hasAnyBillingHistory && (
              <div
                className={cn(
                  'border rounded-lg text-center bg-muted/20 flex items-center justify-center',
                  isMobile ? 'p-4 h-16' : 'p-6 h-20',
                )}
              >
                <p className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-xs')}>
                  No billing history yet
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Uploads ────────────────────────────────────────────────────────────────

interface UploadedFile {
  key: string;
  url: string;
  size: number;
  lastModified: string | null;
  filename: string;
  mediaType: string | null;
  chatId: string | null;
  source: 'r2' | 'legacy' | 'vercel-blob';
}

interface UploadsResponse {
  files: UploadedFile[];
  nextCursor: string | null;
  isTruncated: boolean;
}

type FileFilter = 'all' | 'images' | 'documents';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mirror the MIME types & extensions supported by /api/upload/route.ts
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

const FILE_TYPES = {
  image: { mimes: IMAGE_MIMES, exts: IMAGE_EXTENSIONS },
  pdf: { mimes: ['application/pdf'], exts: ['.pdf'] },
  csv: { mimes: ['text/csv'], exts: ['.csv'] },
  docx: { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], exts: ['.docx'] },
  xlsx: {
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    exts: ['.xlsx', '.xls'],
  },
  pptx: {
    mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    exts: ['.pptx'],
  },
} as const;

type DetectedType = keyof typeof FILE_TYPES;

function detectFileType(mediaType: string | null, filename: string): DetectedType | 'unknown' {
  const mt = (mediaType ?? '').toLowerCase();
  const name = filename.toLowerCase();
  for (const [type, { mimes, exts }] of Object.entries(FILE_TYPES) as [
    DetectedType,
    { mimes: readonly string[]; exts: readonly string[] },
  ][]) {
    if (mimes.some((m) => mt === m) || exts.some((e) => name.endsWith(e))) return type;
  }
  return 'unknown';
}

function getFileCategory(mediaType: string | null, filename: string): 'image' | 'document' {
  return detectFileType(mediaType, filename) === 'image' ? 'image' : 'document';
}

function FileTypeIcon({
  mediaType,
  filename,
  className,
}: {
  mediaType: string | null;
  filename: string;
  className?: string;
}) {
  const type = detectFileType(mediaType, filename);
  const base = cn(
    'shrink-0 text-[10px] font-bold font-mono uppercase tracking-tight flex items-center justify-center rounded w-7 h-7',
    className,
  );

  const styles: Record<DetectedType | 'unknown', [string, string]> = {
    image: ['bg-violet-500/10 text-violet-500', 'IMG'],
    pdf: ['bg-red-500/10 text-red-500', 'PDF'],
    csv: ['bg-green-500/10 text-green-600', 'CSV'],
    docx: ['bg-blue-500/10 text-blue-500', 'DOC'],
    xlsx: ['bg-emerald-500/10 text-emerald-600', 'XLS'],
    pptx: ['bg-orange-500/10 text-orange-500', 'PPT'],
    unknown: ['bg-muted text-muted-foreground', 'FILE'],
  };

  const [style, label] = styles[type];
  return <div className={cn(base, style)}>{label}</div>;
}

export function UploadsSection() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FileFilter>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error: fetchError,
  } = useInfiniteQuery<UploadsResponse>({
    queryKey: ['uploads'],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const url = cursor ? `/api/upload?cursor=${encodeURIComponent(cursor)}&limit=50` : '/api/upload?limit=50';
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60,
  });

  const allFiles = useMemo(() => data?.pages.flatMap((p) => p.files) ?? [], [data?.pages]);

  // Derived counts per filter
  const counts = useMemo(
    () => ({
      all: allFiles.length,
      images: allFiles.filter((f) => getFileCategory(f.mediaType, f.filename) === 'image').length,
      documents: allFiles.filter((f) => getFileCategory(f.mediaType, f.filename) === 'document').length,
    }),
    [allFiles],
  );

  // Filtered + searched list
  const displayFiles = useMemo(() => {
    let list = allFiles;
    if (activeFilter === 'images') list = list.filter((f) => getFileCategory(f.mediaType, f.filename) === 'image');
    if (activeFilter === 'documents')
      list = list.filter((f) => getFileCategory(f.mediaType, f.filename) === 'document');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.filename.toLowerCase().includes(q));
    }
    return list;
  }, [allFiles, activeFilter, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error('Delete failed');
    },
  });

  const handleDelete = async (file: UploadedFile) => {
    await deleteMutation.mutateAsync(file.url).catch(() => null);
    queryClient.invalidateQueries({ queryKey: ['uploads'] });
    sileo.success({ title: 'File deleted', icon: <Trash2 className="h-4 w-4" /> });
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    setConfirmInput('');
    setConfirmOpen(true);
  };

  const executeBulkDelete = async () => {
    setBulkDeleting(true);
    setConfirmOpen(false);
    const toDelete = allFiles.filter((f) => selected.has(f.key));
    const results = await betterAllSettled(
      Object.fromEntries(
        toDelete.map((f, i) => [
          `delete:${i}`,
          async () =>
            fetch('/api/upload', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: f.url }),
            }),
        ]),
      ),
      getBetterAllOptions(),
    );
    const failed = Object.values(results).filter((r) => r.status === 'rejected').length;
    setBulkDeleting(false);
    setSelected(new Set());
    setConfirmInput('');
    queryClient.invalidateQueries({ queryKey: ['uploads'] });
    if (failed === 0)
      sileo.success({
        title: `${toDelete.length} file${toDelete.length > 1 ? 's' : ''} deleted`,
        icon: <Trash2 className="h-4 w-4" />,
      });
    else
      sileo.error({
        title: `${failed} file${failed > 1 ? 's' : ''} failed to delete`,
        icon: <X className="h-4 w-4" />,
      });
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  };

  const allDisplaySelected = displayFiles.length > 0 && displayFiles.every((f) => selected.has(f.key));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allDisplaySelected) {
      setSelected((prev) => {
        const s = new Set(prev);
        displayFiles.forEach((f) => s.delete(f.key));
        return s;
      });
    } else {
      setSelected((prev) => {
        const s = new Set(prev);
        displayFiles.forEach((f) => s.add(f.key));
        return s;
      });
    }
  };

  const filters: { value: FileFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'images', label: 'Images' },
    { value: 'documents', label: 'Docs' },
  ];

  const confirmWord = 'delete';
  const confirmValid = confirmInput.trim().toLowerCase() === confirmWord;

  return (
    <>
      {/* Bulk-delete confirmation dialog */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setConfirmInput('');
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} file{selected.size > 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone. Type{' '}
              <span className="font-semibold text-foreground">{confirmWord}</span> to confirm.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            placeholder={confirmWord}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && confirmValid) executeBulkDelete();
            }}
            className={cn(
              'mt-1 transition-colors',
              confirmInput && !confirmValid && 'border-destructive focus-visible:ring-destructive/30',
            )}
          />

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmInput('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={!confirmValid || bulkDeleting} onClick={executeBulkDelete}>
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Deleting…
                </>
              ) : (
                `Delete ${selected.size}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {/* Error banner */}
        {fetchError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Failed to load uploads. Please try again.
          </div>
        )}

        {/* Toolbar: search + filter */}
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Search row */}
          <div className="flex items-center gap-3 py-2.5">
            <Search className="size-3.5 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-1">
              {filters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setActiveFilter(f.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all duration-150',
                    activeFilter === f.value
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'text-[10px] tabular-nums leading-none',
                      activeFilter === f.value ? 'opacity-70' : 'text-muted-foreground/50',
                    )}
                  >
                    {counts[f.value]}
                  </span>
                </button>
              ))}
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground/50">
              {counts.all > 0 ? formatBytes(allFiles.reduce((s, f) => s + f.size, 0)) : ''}
            </span>
          </div>
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-primary/25 bg-primary/5">
            <div className="flex items-center gap-2.5">
              <button
                onClick={toggleSelectAll}
                className={cn(
                  'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                  allDisplaySelected ? 'bg-primary border-primary' : 'border-primary/60 bg-background',
                )}
              >
                {allDisplaySelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
              </button>
              <span className="text-sm font-medium text-primary">{selected.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-3 text-xs gap-1.5"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrashIcon className="h-3 w-3" />}
                Delete {selected.size}
              </Button>
            </div>
          </div>
        )}

        {/* File list */}
        {isLoading && !allFiles.length ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-border/60">
            <HugeiconsIcon icon={Attachment01Icon} className="h-5 w-5 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {allFiles.length === 0 ? 'No uploads yet' : 'No files match'}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {allFiles.length === 0
                ? 'Files you attach to chats will appear here'
                : 'Try a different search or filter'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
            {/* Select-all header */}
            <div
              className="flex items-center gap-3 px-4 py-2.5 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={toggleSelectAll}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                  allDisplaySelected ? 'bg-primary border-primary' : 'border-border/60 bg-background',
                )}
              >
                {allDisplaySelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
              </div>
              <span className="text-xs text-muted-foreground">
                {displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            {/* Scrollable file rows */}
            <div className="overflow-y-auto max-h-[55vh] divide-y divide-border/40 scrollbar-w-1 scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/30">
              {displayFiles.map((file) => {
                const isSelected = selected.has(file.key);
                return (
                  <div
                    key={file.key}
                    onClick={() => toggleSelect(file.key)}
                    className={cn(
                      'group flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-accent/30',
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-border/60 bg-background group-hover:border-primary/40',
                      )}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
                    </div>

                    {/* Type badge */}
                    <FileTypeIcon mediaType={file.mediaType} filename={file.filename} />

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isSelected && 'text-primary')}>
                        {file.filename}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatBytes(file.size)}</span>
                        {file.lastModified && (
                          <>
                            <span className="opacity-30">·</span>
                            <span>
                              {new Date(file.lastModified).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.chatId && (
                        <a
                          href={`/search/${file.chatId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Go to chat"
                        >
                          <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                          <span>Go to search</span>
                        </a>
                      )}
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open file"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleDelete(file);
                        }}
                        disabled={deleteMutation.isPending}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <TrashIcon className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full py-3 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Downloads (AI-generated files) ────────────────────────────────────────

interface GeneratedFileEntry {
  id: string;
  key: string;
  url: string;
  filename: string;
  mediaType: string | null;
  kind: 'image' | 'document';
  toolName: string | null;
  sizeBytes: number | null;
  chatId: string | null;
  createdAt: string;
}

interface DownloadsResponse {
  files: GeneratedFileEntry[];
  nextCursor: string | null;
}

export function DownloadsSection() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FileFilter>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error: fetchError,
  } = useInfiniteQuery<DownloadsResponse>({
    queryKey: ['downloads'],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const url = cursor ? `/api/downloads?cursor=${encodeURIComponent(cursor)}&limit=50` : '/api/downloads?limit=50';
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60,
  });

  const allFiles = useMemo(() => data?.pages.flatMap((p) => p.files) ?? [], [data?.pages]);

  const counts = useMemo(
    () => ({
      all: allFiles.length,
      images: allFiles.filter((f) => f.kind === 'image').length,
      documents: allFiles.filter((f) => f.kind === 'document').length,
    }),
    [allFiles],
  );

  const displayFiles = useMemo(() => {
    let list = allFiles;
    if (activeFilter === 'images') list = list.filter((f) => f.kind === 'image');
    if (activeFilter === 'documents') list = list.filter((f) => f.kind === 'document');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.filename.toLowerCase().includes(q));
    }
    return list;
  }, [allFiles, activeFilter, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/downloads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Delete failed');
    },
  });

  const handleDelete = async (file: GeneratedFileEntry) => {
    await deleteMutation.mutateAsync(file.id).catch(() => null);
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
    sileo.success({ title: 'File deleted', icon: <Trash2 className="h-4 w-4" /> });
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    setConfirmInput('');
    setConfirmOpen(true);
  };

  const executeBulkDelete = async () => {
    setBulkDeleting(true);
    setConfirmOpen(false);
    const toDelete = allFiles.filter((f) => selected.has(f.id));
    const results = await betterAllSettled(
      Object.fromEntries(
        toDelete.map((f, i) => [
          `delete:${i}`,
          async () =>
            fetch('/api/downloads', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: f.id }),
            }),
        ]),
      ),
      getBetterAllOptions(),
    );
    const failed = Object.values(results).filter((r) => r.status === 'rejected').length;
    setBulkDeleting(false);
    setSelected(new Set());
    setConfirmInput('');
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
    if (failed === 0)
      sileo.success({
        title: `${toDelete.length} file${toDelete.length > 1 ? 's' : ''} deleted`,
        icon: <Trash2 className="h-4 w-4" />,
      });
    else
      sileo.error({
        title: `${failed} file${failed > 1 ? 's' : ''} failed to delete`,
        icon: <X className="h-4 w-4" />,
      });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const allDisplaySelected = displayFiles.length > 0 && displayFiles.every((f) => selected.has(f.id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allDisplaySelected) {
      setSelected((prev) => {
        const s = new Set(prev);
        displayFiles.forEach((f) => s.delete(f.id));
        return s;
      });
    } else {
      setSelected((prev) => {
        const s = new Set(prev);
        displayFiles.forEach((f) => s.add(f.id));
        return s;
      });
    }
  };

  const filters: { value: FileFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'images', label: 'Images' },
    { value: 'documents', label: 'Docs' },
  ];

  const confirmWord = 'delete';
  const confirmValid = confirmInput.trim().toLowerCase() === confirmWord;

  return (
    <>
      {/* Bulk-delete confirmation dialog */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setConfirmInput('');
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} file{selected.size > 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone. Type{' '}
              <span className="font-semibold text-foreground">{confirmWord}</span> to confirm.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            placeholder={confirmWord}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && confirmValid) executeBulkDelete();
            }}
            className={cn(
              'mt-1 transition-colors',
              confirmInput && !confirmValid && 'border-destructive focus-visible:ring-destructive/30',
            )}
          />

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmInput('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={!confirmValid || bulkDeleting} onClick={executeBulkDelete}>
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Deleting…
                </>
              ) : (
                `Delete ${selected.size}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <p className="text-xs text-muted-foreground/70 -mt-1">
          Images and documents generated by the AI tools (image generation/editing, code interpreter charts,
          document export) — stored on your own bucket.
        </p>

        {fetchError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Failed to load downloads. Please try again.
          </div>
        )}

        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          <div className="flex items-center gap-3 py-2.5">
            <Search className="size-3.5 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-1">
              {filters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setActiveFilter(f.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all duration-150',
                    activeFilter === f.value
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'text-[10px] tabular-nums leading-none',
                      activeFilter === f.value ? 'opacity-70' : 'text-muted-foreground/50',
                    )}
                  >
                    {counts[f.value]}
                  </span>
                </button>
              ))}
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground/50">
              {counts.all > 0 ? formatBytes(allFiles.reduce((s, f) => s + (f.sizeBytes ?? 0), 0)) : ''}
            </span>
          </div>
        </div>

        {someSelected && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-primary/25 bg-primary/5">
            <div className="flex items-center gap-2.5">
              <button
                onClick={toggleSelectAll}
                className={cn(
                  'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                  allDisplaySelected ? 'bg-primary border-primary' : 'border-primary/60 bg-background',
                )}
              >
                {allDisplaySelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
              </button>
              <span className="text-sm font-medium text-primary">{selected.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-3 text-xs gap-1.5"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrashIcon className="h-3 w-3" />}
                Delete {selected.size}
              </Button>
            </div>
          </div>
        )}

        {isLoading && !allFiles.length ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-border/60">
            <Sparkles className="h-5 w-5 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {allFiles.length === 0 ? 'Nothing generated yet' : 'No files match'}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {allFiles.length === 0
                ? 'Images and documents Zetora generates for you will appear here'
                : 'Try a different search or filter'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-2.5 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={toggleSelectAll}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                  allDisplaySelected ? 'bg-primary border-primary' : 'border-border/60 bg-background',
                )}
              >
                {allDisplaySelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
              </div>
              <span className="text-xs text-muted-foreground">
                {displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[55vh] divide-y divide-border/40 scrollbar-w-1 scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/30">
              {displayFiles.map((file) => {
                const isSelected = selected.has(file.id);
                return (
                  <div
                    key={file.id}
                    onClick={() => toggleSelect(file.id)}
                    className={cn(
                      'group flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-accent/30',
                    )}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all',
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-border/60 bg-background group-hover:border-primary/40',
                      )}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
                    </div>

                    <FileTypeIcon mediaType={file.mediaType} filename={file.filename} />

                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isSelected && 'text-primary')}>
                        {file.filename}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatBytes(file.sizeBytes ?? 0)}</span>
                        <span className="opacity-30">·</span>
                        <span>
                          {new Date(file.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        {file.toolName && (
                          <>
                            <span className="opacity-30">·</span>
                            <span className="truncate">{file.toolName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.chatId && (
                        <a
                          href={`/search/${file.chatId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Go to chat"
                        >
                          <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                          <span>Go to search</span>
                        </a>
                      )}
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open file"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleDelete(file);
                        }}
                        disabled={deleteMutation.isPending}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <TrashIcon className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full py-3 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Component for Memories
export function MemoriesSection() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingMemoryIds, setDeletingMemoryIds] = useState<Set<string>>(new Set());

  const {
    data: memoriesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: memoriesLoading,
  } = useInfiniteQuery({
    queryKey: ['memories'],
    queryFn: async ({ pageParam }) => {
      const pageNumber = pageParam as number;
      return await getAllMemories(pageNumber);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const hasMore = lastPage.memories.length >= 20;
      return hasMore ? Number(lastPage.memories[lastPage.memories.length - 1]?.id) : undefined;
    },
    staleTime: 1000 * 60 * 5,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMemory,
    onSuccess: (_, memoryId) => {
      setDeletingMemoryIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(memoryId);
        return newSet;
      });
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      sileo.success({
        title: 'Memory deleted successfully',
        description: 'The memory has been removed',
        icon: <Trash2 className="h-4 w-4" />,
      });
    },
    onError: (_, memoryId) => {
      setDeletingMemoryIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(memoryId);
        return newSet;
      });
      sileo.error({
        title: 'Failed to delete memory',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    },
  });

  const handleDeleteMemory = (id: string) => {
    setDeletingMemoryIds((prev) => new Set(prev).add(id));
    deleteMutation.mutate(id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  const getMemoryContent = (memory: MemoryItem): string => {
    if (memory.summary) return memory.summary;
    if (memory.title) return memory.title;
    if (memory.memory) return memory.memory;
    if (memory.name) return memory.name;
    return 'No content available';
  };

  const displayedMemories = memoriesData?.pages.flatMap((page) => page.memories) || [];

  const totalMemories = memoriesData?.pages.reduce((acc, page) => acc + page.memories.length, 0) || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">01</span>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums">{totalMemories}</span>{' '}
            {totalMemories === 1 ? 'memory' : 'memories'} stored
          </p>
        </div>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-w-1 scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/30">
        {memoriesLoading && !displayedMemories.length ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : displayedMemories.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-36 border border-dashed border-border/60 rounded-xl bg-muted/10">
            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
              <HugeiconsIcon icon={Brain02Icon} className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No memories found</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Memories are created automatically from your conversations
            </p>
          </div>
        ) : (
          <>
            {displayedMemories.map((memory: MemoryItem) => (
              <div
                key={memory.id}
                className="group relative p-3.5 rounded-xl border border-border/60 bg-card/30 hover:bg-card/60 transition-all"
              >
                <div className="pr-8">
                  {memory.title && <h4 className="text-sm font-medium mb-1 text-foreground">{memory.title}</h4>}
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {memory.content || getMemoryContent(memory)}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2.5">
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      <span>{formatDate(memory.createdAt || memory.created_at || '')}</span>
                    </div>
                    {memory.type && (
                      <span className="font-pixel text-[11px] text-muted-foreground/50 uppercase tracking-wider">
                        {memory.type}
                      </span>
                    )}
                    {memory.status && memory.status !== 'done' && (
                      <div className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded text-[9px] font-medium">
                        {memory.status}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteMemory(memory.id)}
                  disabled={deletingMemoryIds.has(memory.id)}
                  className={cn(
                    'absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-destructive',
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                    'touch-manipulation', // Better touch targets on mobile
                  )}
                  style={{ opacity: 1 }} // Always visible on mobile
                >
                  {deletingMemoryIds.has(memory.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <TrashIcon className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ))}

            {hasNextPage && !searchQuery.trim() && (
              <div className="pt-2 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || isFetchingNextPage}
                  size="sm"
                  className="h-8"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Component for Connectors
export function ConnectorsSection({ user }: { user: any }) {
  const isProUser = user?.isProUser || false;
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [connectingProvider, setConnectingProvider] = useState<ConnectorProvider | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<ConnectorProvider | null>(null);
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null);

  const {
    data: connectorsData,
    isLoading: connectorsLoading,
    refetch: refetchConnectors,
  } = useQuery({
    queryKey: ['connectors', user?.id],
    queryFn: listUserConnectorsAction,
    enabled: !!user && isProUser,
    staleTime: 1000 * 60 * 2,
  });

  // Query actual connection status for each provider using Supermemory API
  const connectionStatusQueries = useQuery({
    queryKey: ['connectorsStatus', user?.id],
    queryFn: async () => {
      if (!user?.id || !isProUser) return {};

      const providers = Object.keys(CONNECTOR_CONFIGS) as ConnectorProvider[];
      const statusMap = await all(
        Object.fromEntries(
          providers.map((provider) => [
            `provider:${provider}`,
            async () => {
              try {
                return await getConnectorSyncStatusAction(provider);
              } catch (error) {
                console.error(`Failed to get status for ${provider}:`, error);
                return null;
              }
            },
          ]),
        ),
        getBetterAllOptions(),
      );

      return providers.reduce(
        (acc, provider) => {
          acc[provider] = statusMap[`provider:${provider}`];
          return acc;
        },
        {} as Record<string, any>,
      );
    },
    enabled: !!user?.id && isProUser,
    staleTime: 1000 * 60 * 2,
  });

  const handleConnect = async (provider: ConnectorProvider) => {
    setConnectingProvider(provider);
    try {
      const result = await createConnectorAction(provider);
      if (result.success && result.authLink) {
        window.location.href = result.authLink;
      } else {
        sileo.error({
          title: result.error || 'Failed to connect',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to connect',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleSync = async (provider: ConnectorProvider) => {
    setSyncingProvider(provider);
    try {
      const result = await manualSyncConnectorAction(provider);
      if (result.success) {
        sileo.success({
          title: `${CONNECTOR_CONFIGS[provider].name} sync started`,
          description: 'Your data is being synchronized',
          icon: <Check className="h-4 w-4" />,
        });
        refetchConnectors();
        // Refetch connection status after a delay to show updated counts
        setTimeout(() => {
          connectionStatusQueries.refetch();
        }, 2000);
      } else {
        sileo.error({
          title: result.error || 'Failed to sync',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to sync',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleDelete = async (connectionId: string, providerName: string) => {
    setDeletingConnectionId(connectionId);
    try {
      const result = await deleteConnectorAction(connectionId);
      if (result.success) {
        sileo.success({
          title: `${providerName} disconnected`,
          description: 'The connection has been removed',
          icon: <Trash2 className="h-4 w-4" />,
        });
        refetchConnectors();
        // Also refetch connection statuses immediately to update the UI
        connectionStatusQueries.refetch();
      } else {
        sileo.error({
          title: result.error || 'Failed to disconnect',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to disconnect',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setDeletingConnectionId(null);
    }
  };

  const connections = connectorsData?.connections || [];
  const connectionStatuses = connectionStatusQueries.data || {};

  return (
    <div className={cn('space-y-4', isMobile ? 'space-y-3' : 'space-y-4')}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">01</span>
          <h3 className={cn('font-semibold', isMobile ? 'text-sm' : 'text-base')}>Connected Services</h3>
        </div>
        <p className={cn('text-muted-foreground ml-5', isMobile ? 'text-[11px] leading-relaxed' : 'text-xs')}>
          Connect your cloud services to search across all your documents in one place
        </p>
      </div>

      {/* Beta Announcement Alert */}
      <Alert className="border-primary/20 bg-primary/5 rounded-xl">
        <HugeiconsIcon icon={InformationCircleIcon} className="h-4 w-4 text-primary" />
        <AlertTitle className="text-foreground text-sm">
          Connectors <span className="font-pixel text-[11px] uppercase tracking-wider text-primary/50">Beta</span>
        </AlertTitle>
        <AlertDescription className="text-muted-foreground text-xs">
          Available for Pro users. This feature is in beta and there may be breaking changes.
        </AlertDescription>
      </Alert>

      {!isProUser && (
        <div className="border border-dashed border-border/60 rounded-xl p-6 text-center bg-muted/10">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
              <HugeiconsIcon
                icon={Crown02Icon}
                size={24}
                color="currentColor"
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-base">
                <span className="font-pixel text-xs uppercase tracking-wider">Pro</span> Feature
              </h4>
              <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                Connectors are available for Pro users only. Upgrade to connect Google Drive, Notion, and OneDrive.
              </p>
            </div>
            <Button asChild className="rounded-lg">
              <Link href="/pricing">
                <HugeiconsIcon icon={Crown02Icon} size={14} color="currentColor" strokeWidth={1.5} className="mr-2" />
                Upgrade to Pro
              </Link>
            </Button>
          </div>
        </div>
      )}

      {isProUser && (
        <div className="space-y-3">
          {Object.entries(CONNECTOR_CONFIGS).map(([provider, config]) => {
            const connectionStatus = connectionStatuses[provider]?.status;
            const connection = connections.find((c) => c.provider === provider);
            // A connector is connected if we have a connection record OR if status check confirms it
            const isConnected = !!connection || (connectionStatus?.isConnected && connectionStatus !== null);
            const isConnecting = connectingProvider === provider;
            const isSyncing = syncingProvider === provider;
            const isDeleting = connection && deletingConnectionId === connection.id;
            const isStatusLoading = connectionStatusQueries.isLoading;
            const isComingSoon = provider === 'onedrive';

            return (
              <div key={provider} className={cn('border border-border/60 rounded-xl', isMobile ? 'p-3' : 'p-4')}>
                <div className={cn('flex items-center', isMobile ? 'gap-2' : 'justify-between')}>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-7 h-7 mt-0.5 rounded-lg bg-muted/50">
                      <div className="text-lg">
                        {(() => {
                          const IconComponent = CONNECTOR_ICONS[config.icon];
                          return IconComponent ? <IconComponent /> : null;
                        })()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={cn('font-medium', isMobile ? 'text-[13px]' : 'text-sm')}>{config.name}</h4>
                      <p className={cn('text-muted-foreground', isMobile ? 'text-[10px] leading-tight' : 'text-xs')}>
                        {config.description}
                      </p>
                      {isComingSoon ? (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span
                            className={cn('text-blue-600 dark:text-blue-400', isMobile ? 'text-[10px]' : 'text-xs')}
                          >
                            Coming Soon
                          </span>
                        </div>
                      ) : isStatusLoading && !connection ? (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-muted animate-pulse rounded-full"></div>
                          <span className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                            Checking connection...
                          </span>
                        </div>
                      ) : isConnected ? (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span
                            className={cn('text-green-600 dark:text-green-400', isMobile ? 'text-[10px]' : 'text-xs')}
                          >
                            Connected
                          </span>
                          {(connectionStatus?.email || connection?.email) && (
                            <span className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                              • {connectionStatus?.email || connection?.email}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-muted-foreground/30 rounded-full"></div>
                          <span className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                            Not connected
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn('flex items-center', isMobile ? 'gap-1' : 'gap-2')}>
                    {isComingSoon ? (
                      <Button
                        size="sm"
                        disabled
                        variant="outline"
                        className={cn(
                          'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
                          isMobile ? 'h-7 text-[10px] px-2' : 'h-8',
                        )}
                      >
                        Coming Soon
                      </Button>
                    ) : isConnected ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(provider as ConnectorProvider)}
                          disabled={isSyncing || isDeleting || isStatusLoading}
                          className={cn(isMobile ? 'h-7 text-[10px] px-2' : 'h-8')}
                        >
                          {isSyncing ? (
                            <>
                              <Loader2 className={cn(isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3', 'animate-spin mr-1')} />
                              Syncing...
                            </>
                          ) : (
                            'Sync'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => connection && handleDelete(connection.id, config.name)}
                          disabled={isDeleting || isSyncing || isStatusLoading}
                          className={cn(
                            'text-destructive hover:text-destructive',
                            isMobile ? 'h-7 text-[10px] px-2' : 'h-8',
                          )}
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className={cn(isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3', 'animate-spin mr-1')} />
                              Disconnecting...
                            </>
                          ) : (
                            'Disconnect'
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(provider as ConnectorProvider)}
                        disabled={isConnecting || isStatusLoading}
                        className={cn(isMobile ? 'h-7 text-[10px] px-2' : 'h-8')}
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className={cn(isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3', 'animate-spin mr-1')} />
                            Connecting...
                          </>
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {isConnected && !isComingSoon && (
                  <div className={cn('border-t border-border', isMobile ? 'mt-2 pt-2' : 'mt-3 pt-3')}>
                    <div className={cn('text-xs', isMobile ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-3 gap-4')}>
                      <div>
                        <span className="text-muted-foreground">Document Chunk:</span>
                        <div className="font-medium">
                          {isStatusLoading ? (
                            <span className="text-muted-foreground">Loading...</span>
                          ) : connectionStatus?.documentCount !== undefined ? (
                            connectionStatus.documentCount === 0 ? (
                              <span
                                className="text-amber-600 dark:text-amber-400"
                                title="Documents are being synced from your account"
                              >
                                Syncing...
                              </span>
                            ) : (
                              connectionStatus.documentCount.toLocaleString()
                            )
                          ) : connection?.metadata?.pageToken ? (
                            connection.metadata.pageToken === 0 ? (
                              <span
                                className="text-amber-600 dark:text-amber-400"
                                title="Documents are being synced from your account"
                              >
                                Syncing...
                              </span>
                            ) : (
                              connection.metadata.pageToken.toLocaleString()
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Sync:</span>
                        <div className="font-medium">
                          {isStatusLoading ? (
                            <span className="text-muted-foreground">Loading...</span>
                          ) : connectionStatus?.lastSync || connection?.createdAt ? (
                            new Date(connectionStatus?.lastSync || connection?.createdAt).toLocaleDateString()
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Limit:</span>
                        <div className="font-medium">{config.documentLimit.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface McpServerRecord {
  id: string;
  name: string;
  transportType: 'http' | 'sse';
  url: string;
  authType: 'none' | 'bearer' | 'header' | 'oauth';
  isEnabled: boolean;
  hasCredentials: boolean;
  oauthConfigured?: boolean;
  isOAuthConnected?: boolean;
  oauthIssuerUrl?: string | null;
  oauthAuthorizationUrl?: string | null;
  oauthTokenUrl?: string | null;
  oauthScopes?: string | null;
  oauthClientId?: string | null;
  oauthConnectedAt?: string | null;
  oauthError?: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export function McpSection({ user, isProUser }: { user: any; isProUser?: boolean }) {
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    transportType: 'http' as 'http' | 'sse',
    url: '',
    authType: 'none' as 'none' | 'bearer' | 'header' | 'oauth',
    bearerToken: '',
    headerName: '',
    headerValue: '',
    oauthIssuerUrl: '',
    oauthAuthorizationUrl: '',
    oauthTokenUrl: '',
    oauthScopes: '',
    oauthClientId: '',
    oauthClientSecret: '',
    isEnabled: true,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['mcpServers', user?.id],
    queryFn: async () => {
      const response = await fetch('/api/mcp/servers', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load MCP servers');
      return response.json() as Promise<{ servers: McpServerRecord[] }>;
    },
    enabled: Boolean(user?.id && isProUser),
    staleTime: 10_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const isEditing = Boolean(editingId);
      const endpoint = isEditing ? `/api/mcp/servers/${editingId}` : '/api/mcp/servers';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.cause || body?.message || 'Failed to save MCP server');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      setEditingId(null);
      setForm({
        name: '',
        transportType: 'http',
        url: '',
        authType: 'none',
        bearerToken: '',
        headerName: '',
        headerValue: '',
        oauthIssuerUrl: '',
        oauthAuthorizationUrl: '',
        oauthTokenUrl: '',
        oauthScopes: '',
        oauthClientId: '',
        oauthClientSecret: '',
        isEnabled: true,
      });
      sileo.success({
        title: 'Saved',
        description: 'MCP server settings updated',
      });
    },
    onError: (error: Error) => {
      sileo.error({ title: 'Save failed', description: error.message });
    },
  });

  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const testMutation = useMutation({
    mutationFn: async (serverId: string) => {
      setTestingServerId(serverId);
      const response = await fetch('/api/mcp/servers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.cause || body?.message || 'Connection test failed');
      return body as { toolCount: number };
    },
    onSuccess: (result) => {
      setTestingServerId(null);
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      sileo.success({
        title: 'Connection successful',
        description: `Loaded ${result.toolCount} tool${result.toolCount === 1 ? '' : 's'}`,
      });
    },
    onError: (error: Error) => {
      setTestingServerId(null);
      sileo.error({ title: 'Connection failed', description: error.message });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const response = await fetch(`/api/mcp/servers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] }),
    onError: (error: Error) => sileo.error({ title: 'Update failed', description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete MCP server');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      sileo.success({ title: 'Deleted', description: 'MCP server removed' });
    },
    onError: (error: Error) => sileo.error({ title: 'Delete failed', description: error.message }),
  });

  const oauthStartMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/mcp/servers/${id}/oauth/start`, {
        method: 'POST',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.cause || body?.message || 'Failed to start OAuth');
      return body as { authorizationUrl: string };
    },
    onSuccess: ({ authorizationUrl }) => {
      if (authorizationUrl) window.location.assign(authorizationUrl);
    },
    onError: (error: Error) => sileo.error({ title: 'OAuth failed', description: error.message }),
  });

  const oauthDisconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/mcp/servers/${id}/oauth/disconnect`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to disconnect OAuth');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      sileo.success({ title: 'Disconnected', description: 'OAuth tokens cleared' });
    },
    onError: (error: Error) => sileo.error({ title: 'Disconnect failed', description: error.message }),
  });

  const servers = data?.servers ?? [];

  // Hooks must run unconditionally — declare before the pro-gate early return.
  const [showForm, setShowForm] = useState(false);
  const [showOAuthAdvanced, setShowOAuthAdvanced] = useState(false);

  if (!isProUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">08</span>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">MCP</h4>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Pro required</AlertTitle>
          <AlertDescription>Bring-your-own MCP servers are available on Pro plans only.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      transportType: 'http',
      url: '',
      authType: 'none',
      bearerToken: '',
      headerName: '',
      headerValue: '',
      oauthIssuerUrl: '',
      oauthAuthorizationUrl: '',
      oauthTokenUrl: '',
      oauthScopes: '',
      oauthClientId: '',
      oauthClientSecret: '',
      isEnabled: true,
    });
    setShowOAuthAdvanced(false);
    setShowForm(false);
  };

  const startEdit = (server: McpServerRecord) => {
    setEditingId(server.id);
    setForm({
      name: server.name,
      transportType: server.transportType,
      url: server.url,
      authType: server.authType,
      bearerToken: '',
      headerName: '',
      headerValue: '',
      oauthIssuerUrl: server.oauthIssuerUrl ?? '',
      oauthAuthorizationUrl: server.oauthAuthorizationUrl ?? '',
      oauthTokenUrl: server.oauthTokenUrl ?? '',
      oauthScopes: server.oauthScopes ?? '',
      oauthClientId: server.oauthClientId ?? '',
      oauthClientSecret: '',
      isEnabled: server.isEnabled,
    });
    setShowOAuthAdvanced(
      Boolean(
        (server.oauthAuthorizationUrl && server.oauthAuthorizationUrl.trim()) ||
        (server.oauthTokenUrl && server.oauthTokenUrl.trim()) ||
        (server.oauthScopes && server.oauthScopes.trim()),
      ),
    );
    setShowForm(true);
  };

  return (
    <div className={cn('space-y-4', isMobile ? 'pb-2' : 'pb-0')}>
      {/* Server list */}
      <div className="rounded-xl border border-border/60 divide-y divide-border/40">
        {isLoading && (
          <div className="px-4 py-3.5 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
        )}

        {!isLoading && servers.length === 0 && !showForm && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">No MCP servers configured</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add a remote MCP server to get started</p>
          </div>
        )}

        {!isLoading &&
          servers.map((server) => (
            <div key={server.id} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                {/* Left: info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                        server.isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                      )}
                    />
                    <p className="text-sm font-medium truncate">{server.name}</p>
                    {server.authType === 'oauth' && (
                      <span
                        className={cn(
                          'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                          server.isOAuthConnected
                            ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                            : 'text-muted-foreground/60 border-border/60 bg-muted/30',
                        )}
                      >
                        {server.isOAuthConnected ? 'Connected' : 'Not connected'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 truncate pl-3.5">{server.url}</p>
                  {(server.oauthError || server.lastError) && (
                    <p className="text-[11px] text-red-500/80 mt-1 pl-3.5 truncate">
                      {server.oauthError || server.lastError}
                    </p>
                  )}
                </div>

                {/* Right: toggle + overflow menu */}
                <div className="flex items-center gap-2 shrink-0">
                  {server.authType === 'oauth' && !server.isOAuthConnected && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2.5 rounded-lg"
                      onClick={() => oauthStartMutation.mutate(server.id)}
                      disabled={oauthStartMutation.isPending}
                    >
                      {oauthStartMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <ExternalLink className="h-3 w-3 mr-1" />
                      )}
                      Connect
                    </Button>
                  )}

                  <Switch
                    checked={server.isEnabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: server.id, isEnabled: checked })}
                    disabled={toggleMutation.isPending}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => testMutation.mutate(server.id)}
                        disabled={testMutation.isPending && testingServerId === server.id}
                      >
                        {testMutation.isPending && testingServerId === server.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 mr-2" />
                        )}
                        Test connection
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => startEdit(server)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {server.authType === 'oauth' && server.isOAuthConnected && (
                        <>
                          <DropdownMenuItem
                            onClick={() => oauthStartMutation.mutate(server.id)}
                            disabled={oauthStartMutation.isPending}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-2" />
                            Reconnect OAuth
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => oauthDisconnectMutation.mutate(server.id)}
                            disabled={oauthDisconnectMutation.isPending}
                            className="text-muted-foreground"
                          >
                            <Link2Off className="h-3.5 w-3.5 mr-2" />
                            Disconnect OAuth
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setConfirmDeleteId(server.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}

        {/* Delete confirmation dialog */}
        <Dialog
          open={Boolean(confirmDeleteId)}
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteId(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete MCP Server</DialogTitle>
              <DialogDescription>
                {confirmDeleteId && servers.find((s) => s.id === confirmDeleteId) ? (
                  <>
                    Remove{' '}
                    <span className="font-medium text-foreground">
                      {servers.find((s) => s.id === confirmDeleteId)!.name}
                    </span>
                    ? This will disconnect any OAuth sessions and cannot be undone.
                  </>
                ) : (
                  'This will permanently remove the server and disconnect any OAuth sessions.'
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirmDeleteId) {
                    deleteMutation.mutate(confirmDeleteId);
                    setConfirmDeleteId(null);
                    if (editingId === confirmDeleteId) resetForm();
                  }
                }}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-3 w-3 mr-1.5" />
                )}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add / Edit form — inline expand */}
        {showForm && (
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{editingId ? 'Edit Server' : 'New Server'}</p>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetForm}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                placeholder="Server name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="h-8 text-sm rounded-lg"
              />
              <Input
                placeholder="https://your-mcp-endpoint.com/mcp"
                value={form.url}
                onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                className="h-8 text-sm rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select
                value={form.transportType}
                onValueChange={(value: 'http' | 'sse') => setForm((prev) => ({ ...prev, transportType: value }))}
              >
                <SelectTrigger className="h-8 text-xs rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={form.authType}
                onValueChange={(value: 'none' | 'bearer' | 'header' | 'oauth') => {
                  setForm((prev) => ({ ...prev, authType: value }));
                  if (value !== 'oauth') setShowOAuthAdvanced(false);
                }}
              >
                <SelectTrigger className="h-8 text-xs rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No auth</SelectItem>
                  <SelectItem value="bearer">Bearer token</SelectItem>
                  <SelectItem value="header">Custom header</SelectItem>
                  <SelectItem value="oauth">OAuth 2.1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.authType === 'bearer' && (
              <Input
                type="password"
                placeholder="Bearer token"
                value={form.bearerToken}
                onChange={(event) => setForm((prev) => ({ ...prev, bearerToken: event.target.value }))}
                className="h-8 text-sm rounded-lg"
              />
            )}

            {form.authType === 'header' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  placeholder="Header name (e.g. x-api-key)"
                  value={form.headerName}
                  onChange={(event) => setForm((prev) => ({ ...prev, headerName: event.target.value }))}
                  className="h-8 text-sm rounded-lg"
                />
                <Input
                  type="password"
                  placeholder="Header value"
                  value={form.headerValue}
                  onChange={(event) => setForm((prev) => ({ ...prev, headerValue: event.target.value }))}
                  className="h-8 text-sm rounded-lg"
                />
              </div>
            )}

            {form.authType === 'oauth' && (
              <div className="space-y-2">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                  <p className="font-medium text-foreground">Quick setup</p>
                  <p>No OAuth fields needed for most servers. Save, then press Connect.</p>
                </div>
                <button
                  type="button"
                  className="flex h-7 items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowOAuthAdvanced((prev) => !prev)}
                >
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', showOAuthAdvanced ? 'rotate-180' : '')}
                  />
                  {showOAuthAdvanced ? 'Hide advanced OAuth fields' : 'Show advanced OAuth fields'}
                </button>
                {showOAuthAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      placeholder="Provider URL / Issuer (optional)"
                      value={form.oauthIssuerUrl}
                      onChange={(event) => setForm((prev) => ({ ...prev, oauthIssuerUrl: event.target.value }))}
                      className="h-8 text-sm rounded-lg"
                    />
                    <Input
                      placeholder="OAuth app/client ID (optional)"
                      value={form.oauthClientId}
                      onChange={(event) => setForm((prev) => ({ ...prev, oauthClientId: event.target.value }))}
                      className="h-8 text-sm rounded-lg"
                    />
                    <Input
                      placeholder="Scopes (optional)"
                      value={form.oauthScopes}
                      onChange={(event) => setForm((prev) => ({ ...prev, oauthScopes: event.target.value }))}
                      className="h-8 text-sm rounded-lg"
                    />
                    <Input
                      type="password"
                      placeholder="App secret (optional)"
                      value={form.oauthClientSecret}
                      onChange={(event) => setForm((prev) => ({ ...prev, oauthClientSecret: event.target.value }))}
                      className="h-8 text-sm rounded-lg"
                    />
                    <Input
                      placeholder="Authorization URL (advanced fallback)"
                      value={form.oauthAuthorizationUrl}
                      onChange={(event) => setForm((prev) => ({ ...prev, oauthAuthorizationUrl: event.target.value }))}
                      className="h-8 text-sm rounded-lg"
                    />
                    <Input
                      placeholder="Token URL (advanced fallback)"
                      value={form.oauthTokenUrl}
                      onChange={(event) => setForm((prev) => ({ ...prev, oauthTokenUrl: event.target.value }))}
                      className="h-8 text-sm rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs rounded-lg px-3"
                onClick={() => upsertMutation.mutate(form)}
                disabled={upsertMutation.isPending || !form.name.trim() || !form.url.trim()}
              >
                {upsertMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <Save className="h-3 w-3 mr-1.5" />
                )}
                {editingId ? 'Update' : 'Add'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg px-3" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Add button row */}
        {!showForm && (
          <div className="px-4 py-2.5">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs rounded-lg px-3 text-muted-foreground hover:text-foreground"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Plus className="h-3 w-3 mr-1.5" />
              Add MCP Server
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load servers</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function SkillsSection() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [disabledSkills, setDisabledSkills] = useSyncedPreferences<string[]>('zetora-disabled-skills', []);
  const allSkills = SKILL_CATALOG;
  const enabledCount = allSkills.length - disabledSkills.filter((id) => allSkills.some((s) => s.id === id)).length;

  const toggleSkill = (skillId: string, enabled: boolean) => {
    if (enabled) {
      setDisabledSkills(disabledSkills.filter((id) => id !== skillId));
    } else {
      setDisabledSkills([...disabledSkills, skillId]);
    }
  };

  const sections: Array<{ key: 'core' | 'other'; label: string }> = [
    { key: 'core', label: 'Core' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <div className={cn(isMobile ? 'space-y-4' : 'space-y-5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">01</span>
          <h3 className={cn('font-semibold', isMobile ? 'text-sm' : 'text-base')}>Skills</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground/60">
            {enabledCount}/{allSkills.length} enabled
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-md"
            onClick={() => setDisabledSkills([])}
          >
            All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-md"
            onClick={() => setDisabledSkills(allSkills.map((s) => s.id))}
          >
            None
          </Button>
        </div>
      </div>

      <div>
        <h4 className={cn('font-medium', isMobile ? 'text-[13px]' : 'text-sm')}>Skill Directory</h4>
        <p className={cn('text-muted-foreground mt-1', isMobile ? 'text-[11px] leading-relaxed' : 'text-xs')}>
          Skills are playbooks that guide the AI through complex tasks. Enable the ones you want active in your
          chats.
        </p>
      </div>

      {sections.map(({ key, label }) => {
        const skillsInSection = allSkills.filter((s) => s.section === key);
        if (skillsInSection.length === 0) return null;
        return (
          <div key={key} className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">{label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {skillsInSection.map((skill) => {
                const isEnabled = !disabledSkills.includes(skill.id);
                return (
                  <div key={skill.id} className="border border-border/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h5 className={cn('font-medium truncate', isMobile ? 'text-[13px]' : 'text-sm')}>
                          {skill.name}
                        </h5>
                        <span className="font-pixel text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                          {skill.category}
                        </span>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => toggleSkill(skill.id, checked)}
                        className="shrink-0"
                      />
                    </div>
                    <p className={cn('text-muted-foreground leading-relaxed', isMobile ? 'text-[11px]' : 'text-xs')}>
                      {skill.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-muted-foreground/50 text-center pt-1">
        Changes sync automatically and take effect on your next message.
      </p>
    </div>
  );
}

interface DiagnosticsServiceInfo {
  id: string;
  label: string;
  configured: boolean;
}

interface DiagnosticsResult {
  ok: boolean;
  detail?: string;
  latencyMs: number;
}

export function DiagnosticsSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['diagnosticsServices'],
    queryFn: async () => {
      const response = await fetch('/api/diagnostics/services', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load service list');
      return response.json() as Promise<{ services: DiagnosticsServiceInfo[] }>;
    },
    staleTime: 60_000,
  });

  const [results, setResults] = useState<Record<string, DiagnosticsResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const testMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      setTestingId(serviceId);
      const response = await fetch('/api/diagnostics/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || body?.message || 'Test failed');
      return body as { id: string; ok: boolean; detail?: string; latencyMs: number };
    },
    onSuccess: (result) => {
      setTestingId(null);
      setResults((prev) => ({ ...prev, [result.id]: result }));
    },
    onError: (mutationError: Error, serviceId) => {
      setTestingId(null);
      setResults((prev) => ({ ...prev, [serviceId]: { ok: false, detail: mutationError.message, latencyMs: 0 } }));
    },
  });

  const services = data?.services ?? [];
  const configuredServices = services.filter((s) => s.configured);

  const testAll = async () => {
    for (const service of configuredServices) {
      // Sequential on purpose: a stampede of simultaneous pings to every
      // local service right after a fresh `docker compose up` is the exact
      // scenario this panel exists to diagnose — don't add to the load.
      // eslint-disable-next-line no-await-in-loop
      await testMutation.mutateAsync(service.id).catch(() => null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium mb-1">Diagnostics</h3>
          <p className="text-sm text-muted-foreground">
            Check connectivity to the local services this deployment talks to over the Docker network.
          </p>
        </div>
        {configuredServices.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={testAll}
            disabled={testingId !== null}
            className="gap-2 shrink-0"
          >
            <ArrowClockwiseIcon className={cn('h-4 w-4', testingId !== null && 'animate-spin')} />
            Test all
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load the service list.</p>
      ) : configuredServices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No local services are configured for this deployment.</p>
      ) : (
        <div className="space-y-2">
          {configuredServices.map((service) => {
            const result = results[service.id];
            const isTesting = testingId === service.id;
            return (
              <div
                key={service.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{service.label}</p>
                  {result && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 text-xs mt-0.5',
                        result.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      <span className="truncate">
                        {result.ok ? `OK · ${result.latencyMs}ms` : result.detail || 'Connection failed'}
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMutation.mutate(service.id)}
                  disabled={isTesting}
                  className="gap-2 shrink-0"
                >
                  {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {isTesting ? 'Testing...' : 'Test'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  user,
  subscriptionData,
  isProUser,
  isProStatusLoading,
  isCustomInstructionsEnabled,
  setIsCustomInstructionsEnabledAction,
  initialTab = 'profile',
}: SettingsDialogProps) {
  const [currentTab, setCurrentTab] = useState(initialTab);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Reset tab when initialTab changes or when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentTab(initialTab);
    }
  }, [open, initialTab]);
  // Dynamically stabilize drawer height on mobile when the virtual keyboard opens (PWA/iOS)
  const [mobileDrawerPxHeight, setMobileDrawerPxHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!isMobile || !open) {
      setMobileDrawerPxHeight(null);
      return;
    }

    const updateHeight = () => {
      try {
        // Prefer VisualViewport for accurate height when keyboard is open
        const visualHeight = (window as any).visualViewport?.height ?? window.innerHeight;
        const computed = Math.min(600, Math.round(visualHeight * 0.85));
        setMobileDrawerPxHeight(computed);
      } catch {
        setMobileDrawerPxHeight(null);
      }
    };

    updateHeight();
    const vv: VisualViewport | undefined = (window as any).visualViewport;
    vv?.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);

    return () => {
      vv?.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, [isMobile, open]);

  const mcpEnabled = process.env.NEXT_PUBLIC_MCP_ENABLED === 'true';

  const tabItems = [
    {
      value: 'profile',
      label: 'Account',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={UserAccountIcon} className={className} />,
    },
    {
      value: 'usage',
      label: 'Usage',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={Analytics01Icon} className={className} />,
    },
    {
      value: 'subscription',
      label: 'Plan',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={Crown02Icon} className={className} />,
    },
    {
      value: 'preferences',
      label: 'Preferences',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={Settings02Icon} className={className} />,
    },
    {
      value: 'skills',
      label: 'Skills',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={SparklesIcon} className={className} />,
    },
    {
      value: 'connectors',
      label: 'Connectors',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={ConnectIcon} className={className} />,
    },
    ...(mcpEnabled
      ? [
          {
            value: 'mcp',
            label: 'MCP',
            icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={ConnectIcon} className={className} />,
          },
        ]
      : []),
    {
      value: 'memories',
      label: 'Memories',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={Brain02Icon} className={className} />,
    },
    {
      value: 'uploads',
      label: 'Uploads',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={Attachment01Icon} className={className} />,
    },
    {
      value: 'downloads',
      label: 'Downloads',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={Attachment01Icon} className={className} />,
    },
    {
      value: 'diagnostics',
      label: 'Diagnostics',
      icon: ({ className }: { className?: string }) => <HugeiconsIcon icon={ConnectIcon} className={className} />,
    },
  ].map((item, index) => ({ ...item, number: String(index + 1).padStart(2, '0') }));

  const contentSections = (
    <>
      {currentTab === 'profile' && (
        <ProfileSection
          user={user}
          subscriptionData={subscriptionData}
          isProUser={isProUser}
          isProStatusLoading={isProStatusLoading}
        />
      )}

      {currentTab === 'usage' && <UsageSection user={user} />}

      {currentTab === 'subscription' && (
        <SubscriptionSection subscriptionData={subscriptionData} isProUser={isProUser} user={user} />
      )}

      {currentTab === 'preferences' && (
        <PreferencesSection
          user={user}
          isCustomInstructionsEnabled={isCustomInstructionsEnabled}
          setIsCustomInstructionsEnabledAction={setIsCustomInstructionsEnabledAction}
        />
      )}

      {currentTab === 'skills' && <SkillsSection />}

      {currentTab === 'connectors' && <ConnectorsSection user={user} />}

      {currentTab === 'mcp' && <McpSection user={user} isProUser={isProUser} />}

      {currentTab === 'memories' && <MemoriesSection />}

      {currentTab === 'uploads' && <UploadsSection />}

      {currentTab === 'downloads' && <DownloadsSection />}

      {currentTab === 'diagnostics' && <DiagnosticsSection />}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className="h-[85vh] max-h-[600px] p-0 data-vaul-drawer:transition-none overflow-hidden"
          style={{
            height: mobileDrawerPxHeight ?? undefined,
            maxHeight: mobileDrawerPxHeight ?? undefined,
          }}
        >
          <div className="flex flex-col h-full max-h-full">
            {/* Header */}
            <DrawerHeader className="pb-2 px-4 pt-3 shrink-0 border-b border-border/40">
              <DrawerTitle className="text-base font-medium flex items-center gap-2.5">
                <ZetoraLogo className="size-5" />
                <span>Settings</span>
                <span className="font-pixel text-[11px] text-muted-foreground/50 uppercase tracking-[0.15em]">
                  {tabItems.find((t) => t.value === currentTab)?.number}
                </span>
              </DrawerTitle>
            </DrawerHeader>

            {/* Content area with tabs */}
            <div className="flex-1 flex flex-col overflow-hidden gap-0">
              {/* Tab content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4! overscroll-contain scrollbar-w-1! scrollbar-track-transparent! scrollbar-thumb-muted-foreground/20! hover:scrollbar-thumb-muted-foreground/30!">
                {contentSections}
              </div>

              {/* Bottom tab navigation */}
              <div
                className={cn(
                  'border-t border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 shrink-0',
                  currentTab === 'preferences' || currentTab === 'connectors' || currentTab === 'mcp'
                    ? 'pb-[calc(env(safe-area-inset-bottom)+2.5rem)]'
                    : 'pb-[calc(env(safe-area-inset-bottom)+1rem)]',
                )}
              >
                <div className="w-full py-1.5 mb-2 px-3 sm:px-4 flex gap-1.5 overflow-x-auto scrollbar-none">
                  {tabItems.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setCurrentTab(item.value)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-0.5 h-16 rounded-lg relative px-3 min-w-16 shrink-0 transition-colors',
                        currentTab === item.value ? 'bg-accent/80' : 'hover:bg-accent/40',
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4.5 w-4.5 transition-colors',
                          currentTab === item.value ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      />
                      <span
                        className={cn(
                          'text-[10px] mt-0.5 transition-colors',
                          currentTab === item.value ? 'text-foreground font-medium' : 'text-muted-foreground',
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl! w-full! max-h-[85vh] p-0! gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 m-0! border-b border-border/40">
          <DialogTitle className="text-lg font-semibold tracking-tight flex items-center gap-2.5">
            <ZetoraLogo className="size-5" color="currentColor" />
            <span>Settings</span>
            <span className="font-pixel text-[11px] text-muted-foreground/50 uppercase tracking-[0.15em]">
              {tabItems.find((t) => t.value === currentTab)?.number}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-52 m-0! border-r border-border/40 overflow-y-auto">
            <div className="p-3 gap-0.5! flex flex-col">
              {tabItems.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setCurrentTab(item.value)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                    'hover:bg-accent/50',
                    currentTab === item.value
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="font-pixel-grid text-[11px] text-muted-foreground/50 w-3.5">{item.number}</span>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-[calc(85vh-120px)] scrollbar-w-1! scrollbar-track-transparent! scrollbar-thumb-muted-foreground/20! hover:scrollbar-thumb-muted-foreground/30!">
              <div className="p-6 pb-8">
                <div>{contentSections}</div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
