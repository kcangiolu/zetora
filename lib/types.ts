import { z } from 'zod';
import type {
  academicSearchTool,
  codeInterpreterTool,
  coinDataByContractTool,
  coinDataTool,
  coinOhlcTool,
  currencyConverterTool,
  redditSearchTool,
  githubSearchTool,
  retrieveTool,
  trendingMoviesTool,
  textTranslateTool,
  xSearchTool,
  stockChartTool,
  webSearchTool,
  youtubeSearchTool,
  weatherTool,
  findPlaceOnMapTool,
  nearbyPlacesSearchTool,
  flightTrackerTool,
  datetimeTool,
  // mcpSearchTool,
  extremeSearchTool,
  greetingTool,
  movieTvSearchTool,
  trendingTvTool,
  createConnectorsSearchTool,
  createMemoryTools,
  SearchMemoryTool,
  AddMemoryTool,
  codeContextTool,
  createFileQuerySearchTool,
  spotifySearchTool,
  predictionSearchTool,
  skillTool,
  generateImageTool,
  editImageTool,
} from '@/lib/tools';

import type { InferUITool, UIMessage } from 'ai';
import type { SpecDataPart } from '@json-render/core';

export type DataQueryCompletionPart = {
  type: 'data-query_completion';
  data: {
    query: string;
    index: number;
    total: number;
    status: 'started' | 'completed' | 'error';
    resultsCount: number;
    imagesCount: number;
  };
};

export type DataExtremeSearchPart = {
  type: 'data-extreme_search';
  data:
    | {
        kind: 'plan';
        status: { title: string };
        plan?: Array<{ title: string; todos: string[] }>;
      }
    | {
        kind: 'query';
        queryId: string;
        query: string;
        index: number;
        total: number;
        status: 'started' | 'reading_content' | 'completed' | 'error';
      }
    | {
        kind: 'source';
        queryId: string;
        source: { title: string; url: string; favicon?: string };
      }
    | {
        kind: 'content';
        queryId: string;
        content: { title: string; url: string; text: string; favicon?: string };
      }
    | {
        kind: 'thinking';
        thinkingId: string;
        thought: string;
        nextStep?: string;
      }
    | {
        kind: 'code';
        codeId: string;
        title: string;
        code: string;
        status: 'running' | 'completed' | 'error';
        result?: string;
        charts?: any[];
      }
    | {
        kind: 'x_search';
        xSearchId: string;
        query: string;
        index: number;
        total: number;
        startDate: string;
        endDate: string;
        handles?: string[];
        status: 'started' | 'completed' | 'error';
        result?: {
          content: string;
          citations: any[];
          sources: Array<{ text: string; link: string; title?: string }>;
          dateRange: string;
          handles: string[];
        };
      }
    | {
        kind: 'file_query';
        fileQueryId: string;
        query: string;
        index: number;
        total: number;
        status: 'started' | 'completed' | 'error';
        results?: Array<{
          fileName: string;
          content: string;
          score: number;
        }>;
      }
    | {
        kind: 'browse_page';
        browseId: string;
        urls: string[];
        index: number;
        total: number;
        status: 'started' | 'browsing' | 'completed' | 'error';
        results?: Array<{
          url: string;
          title: string;
          content: string;
          favicon?: string;
          error?: string;
        }>;
      }
    | {
        kind: 'done';
        summary: string;
      };
};

const messageMetadataSchema = z.object({
  createdAt: z.string(),
  model: z.string(),
  multiAgentMode: z.boolean().optional(),
  completionTime: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  // Marks the synthetic assistant message holding the automatic
  // context-compaction summary (lib/search/context-compaction.ts). Optional:
  // absent/false for every ordinary message.
  isCompactionSummary: z.boolean().optional(),
  // Display-only count of original messages the current summary text
  // represents ("Summary of N earlier messages"). Null/absent for non-summary
  // messages.
  compactionReplacedCount: z.number().nullable().optional(),
});

type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof weatherTool>;
type academicSearchTool = InferUITool<ReturnType<typeof academicSearchTool>>;
type codeInterpreterTool = InferUITool<typeof codeInterpreterTool>;
type coinDataTool = InferUITool<typeof coinDataTool>;
type coinOhlcTool = InferUITool<typeof coinOhlcTool>;
type currencyConverterTool = InferUITool<typeof currencyConverterTool>;
type redditSearchTool = InferUITool<ReturnType<typeof redditSearchTool>>;
type githubSearchTool = InferUITool<ReturnType<typeof githubSearchTool>>;
type retrieveTool = InferUITool<typeof retrieveTool>;
type trendingMoviesTool = InferUITool<typeof trendingMoviesTool>;
type textTranslateTool = InferUITool<typeof textTranslateTool>;
type xSearchTool = InferUITool<ReturnType<typeof xSearchTool>>;
type stockChartTool = InferUITool<typeof stockChartTool>;
type greetingTool = InferUITool<ReturnType<typeof greetingTool>>;
type flightTrackerTool = InferUITool<typeof flightTrackerTool>;
type findPlaceOnMapTool = InferUITool<typeof findPlaceOnMapTool>;
type nearbyPlacesSearchTool = InferUITool<typeof nearbyPlacesSearchTool>;
type webSearch = InferUITool<ReturnType<typeof webSearchTool>>;
type extremeSearchTool = InferUITool<ReturnType<typeof extremeSearchTool>>;
type movieTvSearchTool = InferUITool<typeof movieTvSearchTool>;
type trendingTvTool = InferUITool<typeof trendingTvTool>;
type youtubeSearchTool = InferUITool<typeof youtubeSearchTool>;
type coinDataByContractTool = InferUITool<typeof coinDataByContractTool>;
type datetimeTool = InferUITool<typeof datetimeTool>;
type createConnectorsSearchTool = InferUITool<ReturnType<typeof createConnectorsSearchTool>>;
type createMemoryTools = InferUITool<SearchMemoryTool>;
type addMemoryTools = InferUITool<AddMemoryTool>;
type codeContextTool = InferUITool<typeof codeContextTool>;
type fileQuerySearchTool = InferUITool<ReturnType<typeof createFileQuerySearchTool>>;
type spotifySearchTool = InferUITool<typeof spotifySearchTool>;
type predictionSearchTool = InferUITool<ReturnType<typeof predictionSearchTool>>;
type skillTool = InferUITool<typeof skillTool>;
type generateImageTool = InferUITool<typeof generateImageTool>;
type editImageTool = InferUITool<typeof editImageTool>;

// type mcpSearchTool = InferUITool<typeof mcpSearchTool>;

export type ChatTools = {
  stock_chart: stockChartTool;
  currency_converter: currencyConverterTool;
  coin_data: coinDataTool;
  coin_data_by_contract: coinDataByContractTool;
  coin_ohlc: coinOhlcTool;

  // Search & Content Tools
  x_search: xSearchTool;
  web_search: webSearch;
  xai_web_search: webSearch;
  academic_search: academicSearchTool;
  youtube_search: youtubeSearchTool;
  spotify_search: spotifySearchTool;
  reddit_search: redditSearchTool;
  github_search: githubSearchTool;
  prediction_search: predictionSearchTool;
  retrieve: retrieveTool;
  xai_x_search: xSearchTool;

  // Media & Entertainment
  movie_or_tv_search: movieTvSearchTool;
  trending_movies: trendingMoviesTool;
  trending_tv: trendingTvTool;

  // Location & Maps
  find_place_on_map: findPlaceOnMapTool;
  nearby_places_search: nearbyPlacesSearchTool;
  get_weather_data: weatherTool;

  // Utility Tools
  text_translate: textTranslateTool;
  code_interpreter: codeInterpreterTool;
  track_flight: flightTrackerTool;
  datetime: datetimeTool;
  // mcp_search: mcpSearchTool;
  extreme_search: extremeSearchTool;
  greeting: greetingTool;

  connectors_search: createConnectorsSearchTool;
  search_memories: createMemoryTools;
  add_memory: addMemoryTools;

  code_context: codeContextTool;
  file_query_search: fileQuerySearchTool;
  skill: skillTool;
  generate_image: generateImageTool;
  edit_image: editImageTool;
};

type DataPredictionResultsPart = {
  type: 'data-prediction_results';
  data: {
    query: string;
    markets: Array<{
      id: string;
      title: string;
      description: string;
      url: string;
      source: 'Polymarket' | 'Kalshi';
      category: string | null;
      totalVolume: number;
      totalLiquidity?: number;
      totalOpenInterest?: number;
      endDate: string | null;
      markets: Array<{
        id: string;
        title: string;
        outcomes: Array<{
          name: string;
          probability: number;
          price: number;
        }>;
        volume: number;
        volume24h: number;
        liquidity?: number;
        openInterest?: number;
        endDate: string;
        active: boolean;
        closed: boolean;
      }>;
      relevanceScore: number;
    }>;
    totalResults: number;
    sources: {
      web: number;
      proprietary: number;
    };
  };
};

export type CustomUIDataTypes = {
  appendMessage: string;
  id: string;
  'message-annotations': any;
  query_completion: {
    query: string;
    index: number;
    total: number;
    status: 'started' | 'completed' | 'error';
    resultsCount: number;
    imagesCount: number;
  };
  auto_routed_model: { model: string; route: string };
  extreme_search: DataExtremeSearchPart['data'];
  prediction_results: DataPredictionResultsPart['data'];
  chat_title: { title: string };
  spec: SpecDataPart;
  mcp_elicitation: {
    elicitationId: string;
    serverName: string;
    message: string;
    mode: 'form' | 'url';
    requestedSchema?: unknown;
    url?: string;
  };
  mcp_elicitation_done: { elicitationId: string };
  // Live push of a newly-created/updated compaction-summary message so the
  // client can optimistically insert/update it in `messages` state without
  // waiting for a reload — mirrors how `chat_title` propagates its update.
  compaction_summary: {
    messageId: string;
    text: string;
    replacedCount: number;
    createdAt: string;
  };
  // The compaction LLM call itself failed/timed out this turn — the request
  // still completed via the pre-existing drop fallback (pruneToContextBudget).
  context_compaction_warning: { message: string };
  // pruneToContextBudget actually dropped messages this turn (compaction
  // disabled, or a compaction attempt just failed) — makes the previously
  // silent drop visible.
  context_excluded_count: { count: number };
  // A Hermes Agent `prompt` action (approval/clarify/choice) rendered as native buttons —
  // see components/message-parts/hermes-prompt.tsx. `promptId` is gateway-minted and
  // opaque; echoed back verbatim in the button click's prompt_response.
  hermes_prompt: {
    promptId: string;
    promptKind: 'approval' | 'clarify' | 'choice' | string;
    content: string;
    options: Array<{ id: string; label: string; style?: 'primary' | 'success' | 'danger' | 'secondary' }>;
  };
};

export type HermesPromptData = CustomUIDataTypes['hermes_prompt'];

export type ChatMessage = UIMessage<MessageMetadata, CustomUIDataTypes, ChatTools>;

export interface Attachment {
  name: string;
  url: string;
  contentType?: string;
  mediaType?: string;
}
