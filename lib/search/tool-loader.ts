import 'server-only';

import type { SkillId } from '@/lib/search/search-groups';
import { getAnonymizeContext } from '@/ai/providers';
import { anonymizeToolInput, deanonymizeToolOutput, type AnonymizeContext } from '@/lib/anonymizer/pseudonymize';
import { getUserAnonymizeContext } from '@/lib/egress/anonymization';
import { isMemoryEnabled } from '@/lib/memory/settings';
import { isToolAvailable } from '@/lib/instance/capabilities';
import type { UserPreferenceValues } from '@/lib/db/schema';
import type { ToolSet, UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '@/lib/types';

// With anonymization on, every tool input is pseudonymized before the tool
// runs, whatever the chat model: a cloud model already writes in pseudonyms
// and this catches a real value that slips through; a local model writes in
// cleartext, and its tool calls would otherwise carry that to search
// engines, MCP servers and other outside services. A model that reads
// cleartext gets the output back in cleartext; for the others the
// anonymization middleware masks it on the way to the provider.
function withEgressAnonymization<T extends { execute?: (...args: any[]) => any }>(
  tool: T,
  ctx: AnonymizeContext,
  restoreOutput: boolean,
): T {
  if (typeof tool?.execute !== 'function') return tool;
  const originalExecute = tool.execute.bind(tool);
  return {
    ...tool,
    execute: async (input: unknown, options: unknown) => {
      const output = await originalExecute(await anonymizeToolInput(input, ctx), options);
      return restoreOutput ? deanonymizeToolOutput(output, ctx) : output;
    },
  };
}

interface LoadConfiguredToolsParams {
  activeToolNames: string[];
  // The model that calls these tools and reads their results.
  chatModelId: string;
  dataStream: UIMessageStreamWriter<ChatMessage> | undefined;
  timezone: string | undefined;
  contextFiles: Array<{ url: string; contentType: string; name?: string }>;
  includeMcpTools: boolean;
  mcpDynamicTools: ToolSet;
  lightweightUser: { userId: string; email: string } | null;
  // The chat a remembered fact comes from; null outside a persisted chat.
  chatId?: string | null;
  userPreferences?: UserPreferenceValues;
  enabledSkillIds?: SkillId[];
}

// Tools that send nothing outside the instance, so they keep cleartext input.
// file_query_search embeds and reranks only on local models while
// anonymization is on (lib/egress/models.ts).
const CLEARTEXT_TOOLS = new Set([
  'datetime',
  'greeting',
  'skill',
  'search_memories',
  'add_memory',
  'file_query_search',
]);

export async function loadConfiguredTools({
  activeToolNames,
  chatModelId,
  dataStream,
  timezone,
  contextFiles,
  includeMcpTools,
  mcpDynamicTools,
  lightweightUser,
  chatId,
  userPreferences,
  enabledSkillIds,
}: LoadConfiguredToolsParams): Promise<ToolSet> {
  const tools: ToolSet = {};
  const anonymizeContext = getUserAnonymizeContext(userPreferences, lightweightUser?.userId);
  const uniqueToolNames = [...new Set(activeToolNames)].filter(isToolAvailable);

  await Promise.all(
    uniqueToolNames.map(async (toolName) => {
      switch (toolName) {
        case 'stock_chart': {
          const { stockChartTool } = await import('@/lib/tools/stock-chart');
          tools.stock_chart = stockChartTool;
          return;
        }
        case 'currency_converter': {
          const { currencyConverterTool } = await import('@/lib/tools/currency-converter');
          tools.currency_converter = currencyConverterTool;
          return;
        }
        case 'coin_data':
        case 'coin_data_by_contract':
        case 'coin_ohlc': {
          const { coinDataTool, coinDataByContractTool, coinOhlcTool } = await import('@/lib/tools/crypto-tools');
          if (uniqueToolNames.includes('coin_data')) tools.coin_data = tools.coin_data ?? coinDataTool;
          if (uniqueToolNames.includes('coin_data_by_contract'))
            tools.coin_data_by_contract = tools.coin_data_by_contract ?? coinDataByContractTool;
          if (uniqueToolNames.includes('coin_ohlc')) tools.coin_ohlc = tools.coin_ohlc ?? coinOhlcTool;
          return;
        }
        case 'x_search': {
          const { xSearchTool } = await import('@/lib/tools/x-search');
          tools.x_search = xSearchTool(dataStream);
          return;
        }
        case 'web_search': {
          const { webSearchTool } = await import('@/lib/tools/web-search');
          tools.web_search = webSearchTool(
            dataStream,
            userPreferences?.['zetora-search-provider'] as string | undefined,
            userPreferences,
            lightweightUser?.userId,
          );
          return;
        }
        case 'academic_search': {
          const { academicSearchTool } = await import('@/lib/tools/academic-search');
          tools.academic_search = academicSearchTool(dataStream, userPreferences);
          return;
        }
        case 'youtube_search': {
          const { youtubeSearchTool } = await import('@/lib/tools/youtube-search');
          tools.youtube_search = youtubeSearchTool;
          return;
        }
        case 'spotify_search': {
          const { spotifySearchTool } = await import('@/lib/tools/spotify-search');
          tools.spotify_search = spotifySearchTool;
          return;
        }
        case 'reddit_search': {
          const { redditSearchTool } = await import('@/lib/tools/reddit-search');
          tools.reddit_search = redditSearchTool(dataStream, userPreferences);
          return;
        }
        case 'github_search': {
          const { githubSearchTool } = await import('@/lib/tools/github-search');
          tools.github_search = githubSearchTool(dataStream, userPreferences);
          return;
        }
        case 'prediction_search': {
          const { predictionSearchTool } = await import('@/lib/tools/prediction-search');
          tools.prediction_search = predictionSearchTool(dataStream);
          return;
        }
        case 'retrieve': {
          const { retrieveTool } = await import('@/lib/tools/retrieve');
          tools.retrieve = retrieveTool;
          return;
        }
        case 'movie_or_tv_search': {
          const { movieTvSearchTool } = await import('@/lib/tools/movie-tv-search');
          tools.movie_or_tv_search = movieTvSearchTool;
          return;
        }
        case 'trending_movies': {
          const { trendingMoviesTool } = await import('@/lib/tools/trending-movies');
          tools.trending_movies = trendingMoviesTool;
          return;
        }
        case 'trending_tv': {
          const { trendingTvTool } = await import('@/lib/tools/trending-tv');
          tools.trending_tv = trendingTvTool;
          return;
        }
        case 'find_place_on_map':
        case 'nearby_places_search': {
          const { findPlaceOnMapTool, nearbyPlacesSearchTool } = await import('@/lib/tools/map-tools');
          if (uniqueToolNames.includes('find_place_on_map'))
            tools.find_place_on_map = tools.find_place_on_map ?? findPlaceOnMapTool;
          if (uniqueToolNames.includes('nearby_places_search'))
            tools.nearby_places_search = tools.nearby_places_search ?? nearbyPlacesSearchTool;
          return;
        }
        case 'get_weather_data': {
          const { weatherTool } = await import('@/lib/tools/weather');
          tools.get_weather_data = weatherTool;
          return;
        }
        case 'text_translate': {
          const { textTranslateTool } = await import('@/lib/tools/text-translate');
          tools.text_translate = textTranslateTool;
          return;
        }
        case 'code_interpreter': {
          const { codeInterpreterTool } = await import('@/lib/tools/code-interpreter');
          tools.code_interpreter = codeInterpreterTool;
          return;
        }
        case 'track_flight': {
          const { flightTrackerTool } = await import('@/lib/tools/flight-tracker');
          tools.track_flight = flightTrackerTool;
          return;
        }
        case 'datetime': {
          const { datetimeTool } = await import('@/lib/tools/datetime');
          tools.datetime = datetimeTool;
          return;
        }
        case 'extreme_search': {
          const { extremeSearchTool } = await import('@/lib/tools/extreme-search');
          tools.extreme_search = extremeSearchTool(dataStream, contextFiles);
          return;
        }
        case 'greeting': {
          const { greetingTool } = await import('@/lib/tools/greeting');
          tools.greeting = greetingTool(timezone);
          return;
        }
        case 'skill': {
          const { createSkillTool } = await import('@/lib/tools/skill');
          tools.skill = createSkillTool(enabledSkillIds ?? [], userPreferences);
          return;
        }
        case 'code_context': {
          const { codeContextTool } = await import('@/lib/tools/code-context');
          tools.code_context = codeContextTool;
          return;
        }
        case 'generate_image': {
          const { generateImageTool } = await import('@/lib/tools/generate-image');
          tools.generate_image = generateImageTool;
          return;
        }
        case 'edit_image': {
          const { editImageTool } = await import('@/lib/tools/edit-image');
          tools.edit_image = editImageTool;
          return;
        }
        case 'download_file': {
          const { downloadFileTool } = await import('@/lib/tools/download-file');
          tools.download_file = downloadFileTool;
          return;
        }
        case 'file_query_search': {
          if (contextFiles.length === 0) return;
          const { createFileQuerySearchTool } = await import('@/lib/tools/file-query-search');
          tools.file_query_search = createFileQuerySearchTool(
            contextFiles,
            dataStream,
            userPreferences,
            lightweightUser?.userId,
            anonymizeContext,
          );
          return;
        }
        case 'search_memories':
        case 'add_memory': {
          if (!lightweightUser || !isMemoryEnabled(userPreferences)) return;
          const { createMemoryTools } = await import('@/lib/memory/tools');
          const { searchMemories, addMemory } = createMemoryTools(lightweightUser.userId, chatId ?? null);
          tools[toolName] = toolName === 'add_memory' ? addMemory : searchMemories;
          return;
        }
        default:
          return;
      }
    }),
  );

  if (includeMcpTools) {
    Object.assign(tools, mcpDynamicTools);
  }

  if (!anonymizeContext) return tools;
  const chatModelReadsCleartext =
    (await getAnonymizeContext(chatModelId, userPreferences, lightweightUser?.userId)) === null;
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      CLEARTEXT_TOOLS.has(name) ? tool : withEgressAnonymization(tool, anonymizeContext, chatModelReadsCleartext),
    ]),
  );
}
