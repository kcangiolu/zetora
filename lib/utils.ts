// /lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  GlobalSearchIcon,
  AtomicPowerIcon,
  Bitcoin02Icon,
  MicroscopeIcon,
  NewTwitterIcon,
  RedditIcon,
  YoutubeIcon,
  ChattingIcon,
  AppleStocksIcon,
  CodeCircleIcon,
  Github01Icon,
  SpotifyIcon,
  Chart03Icon,
  CanvasIcon,
  SparklesIcon,
  BinocularsIcon,
  Robot01Icon,
} from '@hugeicons/core-free-icons';
import { AppsIcon } from '@/components/icons/apps-icon';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Deterministic stand-in for Math.random() in SSR-rendered UI (e.g. skeleton bar
// heights): server and client must compute the same value from the same seed, or
// React logs a hydration mismatch on every load.
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function normalizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/websocket|ws connection|connection (closed|failed|lost)|1006|1011|1012/i.test(msg))
    return 'Connection lost. Please check your internet and try again.';
  if (/oauth|authoriz|token|forbidden|403/i.test(msg))
    return 'Authorization failed. The app may have rejected the request.';
  if (/timeout|timed? ?out/i.test(msg)) return 'This took too long. Please try again.';
  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg))
    return 'Could not connect. Please check your internet and try again.';
  return 'Something went wrong. Please try again.';
}

export const SEARCH_GROUP_IDS = [
  'auto',
  'web',
  'x',
  'academic',
  'youtube',
  'spotify',
  'reddit',
  'github',
  'stocks',
  'chat',
  'extreme',
  'crypto',
  'code',
  'mcp',
  'prediction',
  'canvas',
  'deep-research',
  'extreme-search',
  'hermes',
] as const;

export type SearchGroupId = (typeof SEARCH_GROUP_IDS)[number];

// Research skills loadable via the 'skill' tool, available on every message
// (subject to the zetora-disabled-skills preference).
export type SkillId =
  | 'deep-research'
  | 'extreme-search'
  | 'academic-review'
  | 'social-pulse'
  | 'market-intel'
  | 'media-scout'
  | 'local-guide'
  | 'web-extract'
  | 'deslop'
  | 'image-generation'
  | 'image-editing'
  | 'docx'
  | 'pptx'
  | 'pdf'
  | 'xlsx';

// Modes picked explicitly for one message, replacing the Sources+Skills tool set
// (see lib/search/group-config.ts). 'hermes' skips the LLM pipeline entirely: the
// message goes to the user's Hermes agent (app/api/hermes/send/route.ts).
export type SpecialModeId = 'mcp' | 'canvas' | 'deep-research' | 'extreme-search' | 'hermes';

// Search provider information for dynamic descriptions
const searchProviderInfo = {
  parallel: 'Parallel AI',
  exa: 'Exa, one of the best web search APIs for AI',
  firecrawl: 'Firecrawl',
  searxng: 'SearXNG',
  fastcrw: 'fastCRW',
} as const;

export type SearchProvider = keyof typeof searchProviderInfo;

// Function to get dynamic web search description based on selected provider
export function getWebSearchDescription(provider: SearchProvider = 'exa'): string {
  const providerName = searchProviderInfo[provider];
  return `Search across the entire internet powered by ${providerName}`;
}

// Function to get search groups with dynamic descriptions
export function getSearchGroups(searchProvider: SearchProvider = 'exa') {
  return [
    {
      id: 'auto' as const,
      name: 'Auto',
      description: 'Let Zetora decide the best research strategy for your question',
      icon: SparklesIcon,
      show: true,
    },
    {
      id: 'web' as const,
      name: 'Web',
      description: getWebSearchDescription(searchProvider),
      icon: GlobalSearchIcon,
      show: true,
    },
    {
      id: 'chat' as const,
      name: 'Chat',
      description: 'Talk to the model directly.',
      icon: ChattingIcon,
      show: true,
    },
    {
      id: 'x' as const,
      name: 'X',
      description: 'Search X posts',
      icon: NewTwitterIcon,
      show: true,
    },
    {
      id: 'stocks' as const,
      name: 'Stocks',
      description: 'Stock and currency information',
      icon: AppleStocksIcon,
      show: true,
    },
    {
      id: 'mcp' as const,
      name: 'Apps',
      description: 'Use tools from your connected apps',
      icon: AppsIcon,
      show: process.env.NEXT_PUBLIC_MCP_ENABLED === 'true',
      requireAuth: true,
    },
    {
      id: 'code' as const,
      name: 'Code',
      description: 'Get context about languages and frameworks',
      icon: CodeCircleIcon,
      show: true,
    },
    {
      id: 'academic' as const,
      name: 'Academic',
      description: 'Search academic papers and PDFs',
      icon: MicroscopeIcon,
      show: true,
    },
    {
      id: 'extreme' as const,
      name: 'Extreme',
      description: 'Deep research with multiple sources and analysis',
      icon: AtomicPowerIcon,
      show: true,
      requireAuth: true,
    },
    {
      id: 'reddit' as const,
      name: 'Reddit',
      description: 'Search Reddit posts',
      icon: RedditIcon,
      show: true,
    },
    {
      id: 'github' as const,
      name: 'GitHub',
      description: 'Search GitHub repositories, code, and discussions',
      icon: Github01Icon,
      show: true,
    },
    {
      id: 'crypto' as const,
      name: 'Crypto',
      description: 'Cryptocurrency research powered by CoinGecko',
      icon: Bitcoin02Icon,
      show: true,
    },
    {
      id: 'prediction' as const,
      name: 'Prediction',
      description: 'Search prediction markets from Polymarket and Kalshi',
      icon: Chart03Icon,
      show: true,
    },
    {
      id: 'youtube' as const,
      name: 'YouTube',
      description: 'Search content inside YouTube videos, channels and playlists',
      icon: YoutubeIcon,
      show: true,
    },
    {
      id: 'spotify' as const,
      name: 'Spotify',
      description: 'Search songs, artists, and albums on Spotify',
      icon: SpotifyIcon,
      show: true,
    },
    {
      id: 'canvas' as const,
      name: 'Canvas',
      description: 'Research and generate interactive dashboards and visual reports',
      icon: CanvasIcon,
      show: true,
      requireAuth: true,
    },
    {
      id: 'deep-research' as const,
      name: 'Deep Research',
      description:
        'Forces Deep Research for this message — decomposes multi-part questions into sub-questions and cross-validates each finding before answering.',
      icon: BinocularsIcon,
      show: true,
      requireAuth: true,
    },
    {
      id: 'extreme-search' as const,
      name: 'Extreme Search',
      description:
        'Forces Extreme Search for this message — exhaustive multi-channel research on a single topic via a dedicated research agent; can take several minutes.',
      icon: AtomicPowerIcon,
      show: true,
      requireAuth: true,
    },
    {
      id: 'hermes' as const,
      name: 'Agent',
      description: "Talk to your own Hermes Agent (github.com/NousResearch/hermes-agent) through Zetora — see Settings > Hermes to connect it.",
      // A generic agent mark: the Hermes Agent project has no icon-scale logo (its favicon
      // is the ⚕ glyph, its brand mark a detailed illustration unreadable at 16px).
      icon: Robot01Icon,
      // Always present in the build; only selectable once the user has an enrolled
      // connector, checked where this list is rendered
      // (components/ui/form-component/use-mode-options.ts). Labeled "Agent" rather than
      // "Hermes"; its accent animation lives in components/mode-accent.tsx.
      show: true,
      requireAuth: true,
    },
  ] as const;
}

// Keep the static searchGroups for backward compatibility
const searchGroups = getSearchGroups();

export type SearchGroup = (typeof searchGroups)[number];
