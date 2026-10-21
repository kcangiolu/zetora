import { DataUIPart, isStaticToolUIPart } from 'ai';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { ChatMessage, CustomUIDataTypes, DataQueryCompletionPart, DataExtremeSearchPart } from '@/lib/types';
import { SearchLoadingState } from '@/components/tool-invocation-list-view';
import { GeneratedImageCard } from '@/components/generated-image-card';
import {
  MapPin,
  Film,
  Tv,
  Cloud,
  DollarSign,
  TrendingUpIcon,
  Plane,
  User2,
  Globe,
  YoutubeIcon,
  Code,
  Sparkles,
  Download,
} from 'lucide-react';
import { MemoryIcon } from '@phosphor-icons/react';
import { Spinner } from '../ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import { FlightTracker } from '@/components/flight-tracker';
import TMDBResult from '@/components/movie-info';
import MultiSearch from '@/components/multi-search';
import TrendingResults from '@/components/trending-tv-movies-results';
import AcademicPapersCard from '@/components/academic-papers';
import WeatherChart from '@/components/weather-chart';
import RedditSearch from '@/components/reddit-search';
import GitHubSearch from '@/components/github-search';
import PredictionSearch from '@/components/prediction-search';
import { TextTranslate } from '@/components/text-translate';
import XSearch from '@/components/x-search';
import { ExtremeSearch } from '@/components/extreme-search/extreme-search';
import { CoinData as CryptoCoinsData } from '@/components/crypto-coin-data';
import { CurrencyConverter } from '@/components/currency_conv';
import { YouTubeSearchResults } from '@/components/youtube-search-results';
import { SpotifySearchResults } from '@/components/spotify-search-results';
import { CodeInterpreterView, NearbySearchSkeleton } from '@/components/tool-invocation-list-view';
import { RetrieveResults } from '@/components/retrieve-results';
import FileQuerySearch from '@/components/file-query-search';
import { StockChartLoader, ToolErrorDisplay } from './shared';
import { toImageCardState } from './mcp';
import { DynamicToolInvocationCard, CodeContextTool } from './tools';
import { useMessageActions } from '@/contexts/message-actions-context';
import { ToolNotice } from './shared';
import { CurrentTimeCard, MemoriesFoundCard, MemoryAddedCard, PlacesResultCard } from './tool-cards';

// Components that require browser APIs (Leaflet, charts) - load dynamically with ssr: false
const InteractiveChart = dynamic(() => import('@/components/interactive-charts'), { ssr: false });
const NearbySearchMapView = dynamic(() => import('@/components/nearby-search-map-view'), { ssr: false });
const InteractiveStockChart = dynamic(() => import('@/components/interactive-stock-chart'), { ssr: false });
const CryptoChart = dynamic(() => import('@/components/crypto-charts').then((m) => ({ default: m.CryptoChart })), {
  ssr: false,
});

interface StaticToolPartProps {
  part: ChatMessage['parts'][number];
  // The message's data parts, which some tools stream their progress in.
  annotations: DataUIPart<CustomUIDataTypes>[];
  // Whether the viewer may change this message, here hide or show generated images.
  canEdit: boolean;
  chatId?: string;
  hiddenImageUrls?: Set<string>;
}

// The card of one of Zetora's own tools, by tool and call state.
export function StaticToolPart({ part, annotations, canEdit, chatId, hiddenImageUrls }: StaticToolPartProps) {
  const { onToggleImageHidden } = useMessageActions();
  if (!isStaticToolUIPart(part)) return null;

  // Check if this part has the new state system
  if ('state' in part && part.state) {
    switch (part.type) {
      case 'tool-find_place_on_map':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={MapPin} text="Finding locations..." color="blue" />;
          case 'output-available':
            // Handle error responses
            if (!part.output.success) {
              return (
                <ToolNotice tone="error" icon={MapPin} title="Location search failed">
                  {part.output.error}
                </ToolNotice>
              );
            }

            const { places } = part.output;
            if (!places || places.length === 0) {
              return (
                <ToolNotice tone="empty" icon={MapPin} title="No locations found">
                  Try searching with different keywords or check the spelling.
                </ToolNotice>
              );
            }

            return <PlacesResultCard output={part.output} />;
          case 'output-error':
            return <ToolErrorDisplay errorText={part.errorText} toolName="Location Search" />;
        }
        break;

      case 'tool-movie_or_tv_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={Film} text="Discovering entertainment content..." color="violet" />;
          case 'output-available':
            return <TMDBResult result={part.output} />;
        }
        break;

      case 'tool-stock_chart':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return (
              <StockChartLoader title={part.input?.title || 'Preparing financial analysis...'} input={part.input} />
            );
          case 'output-available':
            return (
              <InteractiveStockChart
                title={part.input.title}
                chart={{
                  ...part.output.chart,
                  x_scale: 'datetime',
                }}
                data={part.output.chart.elements}
                stock_symbols={part.input.companies || []}
                currency_symbols={
                  part.output.currency_symbols ||
                  part.input.currency_symbols ||
                  part.input.companies?.map(() => 'USD') || ['USD']
                }
                interval={part.input.time_period || '1 year'}
                resolved_companies={
                  part.output.resolved_companies?.map((company) => ({
                    ...company,
                    ticker: company.ticker || company.name || 'N/A',
                  })) || []
                }
                earnings_data={
                  part.output.earnings_data?.map((earning) => ({
                    ...earning,
                    ticker: earning.ticker || 'N/A',
                  })) || []
                }
                news_results={part.output.news_results}
                sec_filings={
                  part.output.sec_filings?.map((filing) => ({
                    id: filing.id,
                    title: filing.title,
                    url: filing.url,
                    content: filing.content,
                    metadata: filing.metadata,
                    requestedCompany: 'requestedCompany' in filing ? String(filing.requestedCompany) : 'N/A',
                    requestedFilingType:
                      'requestedFilingType' in filing
                        ? String(filing.requestedFilingType)
                        : 'form_type' in filing
                          ? String(filing.form_type)
                          : '10-K',
                  })) || []
                }
                company_statistics={part.output.company_statistics}
                balance_sheets={part.output.balance_sheets}
                income_statements={part.output.income_statements}
                cash_flows={part.output.cash_flows}
                dividends_data={part.output.dividends_data}
                insider_transactions={part.output.insider_transactions}
                market_movers={part.output.market_movers}
              />
            );
        }
        break;

      case 'tool-get_weather_data':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return (
              <Card className="my-2 py-0 shadow-none bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 gap-0">
                <CardHeader className="py-2 px-3 sm:px-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="h-5 w-32 bg-neutral-200 dark:bg-neutral-800 rounded-md animate-pulse" />
                      <div className="flex items-center mt-1 gap-2">
                        <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-800 rounded-full animate-pulse" />
                        <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-full animate-pulse" />
                      </div>
                    </div>
                    <div className="flex items-center ml-4">
                      <div className="text-right">
                        <div className="h-8 w-16 bg-neutral-200 dark:bg-neutral-800 rounded-md animate-pulse" />
                        <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-md mt-1 animate-pulse" />
                      </div>
                      <div className="h-12 w-12 flex items-center justify-center ml-2">
                        <Cloud className="h-8 w-8 text-neutral-300 dark:text-neutral-700 animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-7 w-28 bg-neutral-200 dark:bg-neutral-800 rounded-full animate-pulse" />
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-3 sm:px-4">
                    <div className="h-8 w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg animate-pulse mb-4" />
                    <div className="h-[180px] w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg animate-pulse" />
                    <div className="flex justify-between mt-4 pb-4 overflow-x-auto no-scrollbar">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center min-w-[60px] sm:min-w-[70px] p-1.5 sm:p-2 mx-0.5"
                        >
                          <div className="h-4 w-12 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse mb-2" />
                          <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse mb-2" />
                          <div className="h-3 w-8 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-neutral-200 dark:border-neutral-800 py-0! px-4 m-0!">
                  <div className="w-full flex justify-end items-center py-1">
                    <div className="h-3 w-32 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                  </div>
                </CardFooter>
              </Card>
            );
          case 'output-available':
            return <WeatherChart result={part.output} />;
        }
        break;

      case 'tool-web_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            return (
              <MultiSearch
                result={part.output || null}
                args={part.input ? part.input : {}}
                annotations={annotations as DataQueryCompletionPart[]}
              />
            );
        }
        break;

      case 'tool-datetime':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return (
              <div className="flex items-center gap-3 py-4 px-2">
                <div className="h-5 w-5 relative">
                  <div className="absolute inset-0 rounded-full border-2 border-neutral-300 dark:border-neutral-700 border-t-blue-500 dark:border-t-blue-400 animate-spin" />
                </div>
                <span className="text-neutral-700 dark:text-neutral-300 text-sm font-medium">
                  Fetching current time...
                </span>
              </div>
            );
          case 'output-available':
            return <CurrentTimeCard output={part.output} />;
        }
        break;

      case 'tool-extreme_search':
        switch (part.state) {
          case 'input-streaming':
            return <div className="text-sm text-neutral-500">Preparing extreme search...</div>;
          case 'input-available':
          case 'output-available':
            return (
              <ExtremeSearch
                annotations={
                  (annotations?.filter(
                    (annotation) => annotation.type === 'data-extreme_search',
                  ) as DataExtremeSearchPart[]) || []
                }
              />
            );
        }
        break;

      case 'tool-text_translate':
        switch (part.state) {
          case 'input-streaming':
            return <div className="text-sm text-neutral-500">Preparing translation...</div>;
          case 'input-available':
          case 'output-available':
            return <TextTranslate args={part.input} result={part.output} />;
        }
        break;

      case 'tool-code_context':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={Code} text="Getting code context..." color="blue" />;
          case 'output-available':
            return <CodeContextTool args={part.input} result={part.output} />;
        }
        break;

      case 'tool-file_query_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            const fileQuerySearchInput = part.input;
            const fileQuerySearchOutput = part.output;
            return (
              <FileQuerySearch
                result={fileQuerySearchOutput || null}
                args={fileQuerySearchInput ? fileQuerySearchInput : {}}
                annotations={annotations as DataQueryCompletionPart[]}
              />
            );
        }
        break;

      case 'tool-trending_movies':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={Film} text="Loading trending movies..." color="blue" />;
          case 'output-available':
            return <TrendingResults result={part.output} type="movie" />;
        }
        break;

      case 'tool-trending_tv':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={Tv} text="Loading trending TV shows..." color="blue" />;
          case 'output-available':
            return <TrendingResults result={part.output} type="tv" />;
        }
        break;

      case 'tool-academic_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            const academicSearchInput = part.input;
            const academicSearchOutput = part.output;
            return (
              <AcademicPapersCard
                response={academicSearchOutput || null}
                args={academicSearchInput ? academicSearchInput : {}}
                annotations={annotations as DataQueryCompletionPart[]}
              />
            );
        }
        break;

      case 'tool-track_flight':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return (
              <div className="w-full max-w-2xl mx-auto">
                <div className="border rounded-md bg-card overflow-hidden shadow-2xs">
                  {/* Compact Header Skeleton */}
                  <div className="px-4 py-2 border-b bg-muted/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                    </div>
                  </div>

                  {/* Compact Body Skeleton */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      {/* Left */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-7 w-20" />
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>

                      {/* Middle */}
                      <div className="flex flex-col items-center justify-center w-28 shrink-0">
                        <div className="flex items-center gap-2 w-full">
                          <div className="flex-1 h-px bg-border"></div>
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                            <Plane className="h-3.5 w-3.5 text-primary animate-pulse" />
                          </div>
                          <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <Skeleton className="h-3 w-12 mt-1" />
                      </div>

                      {/* Right */}
                      <div className="text-right min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-7 w-20 ml-auto" />
                        <Skeleton className="h-6 w-16 ml-auto" />
                        <Skeleton className="h-3 w-32 ml-auto" />
                        <Skeleton className="h-2.5 w-20 ml-auto" />
                      </div>
                    </div>

                    {/* Inline meta skeleton */}
                    <div className="mt-3 pt-2 border-t flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          case 'output-available':
            return <FlightTracker data={part.output} />;
        }
        break;

      case 'tool-reddit_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            const redditSearchInput = part.input;
            const redditSearchOutput = part.output;
            return (
              <RedditSearch
                result={redditSearchOutput || null}
                args={redditSearchInput ? redditSearchInput : {}}
                annotations={annotations as DataQueryCompletionPart[]}
              />
            );
        }
        break;

      case 'tool-github_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            const githubSearchInput = part.input;
            const githubSearchOutput = part.output;
            return (
              <GitHubSearch
                result={githubSearchOutput || null}
                args={githubSearchInput ? githubSearchInput : {}}
                annotations={annotations as DataQueryCompletionPart[]}
              />
            );
        }
        break;

      case 'tool-prediction_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            const predictionSearchInput = part.input;
            const predictionSearchOutput = part.output;
            return (
              <PredictionSearch
                result={predictionSearchOutput || null}
                args={predictionSearchInput ? predictionSearchInput : {}}
                annotations={annotations as DataQueryCompletionPart[]}
              />
            );
        }
        break;

      case 'tool-x_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            const rawXSearchInput = part.input ?? {};
            const xSearchInput = {
              ...rawXSearchInput,
              includeXHandles: rawXSearchInput.includeXHandles?.filter((h): h is string => h !== undefined),
              excludeXHandles: rawXSearchInput.excludeXHandles?.filter((h): h is string => h !== undefined),
            };
            const xSearchOutput = part.output;

            const normalizeCitation = (citation: any) => {
              if (!citation) return null;
              if (typeof citation === 'string') {
                return { url: citation, title: citation, description: '' };
              }
              const url = typeof citation.url === 'string' ? citation.url : '';
              const title =
                typeof citation.title === 'string' && citation.title.length > 0 ? citation.title : url || 'Citation';
              return { ...citation, url, title };
            };

            return (
              <XSearch
                result={
                  xSearchOutput
                    ? {
                        ...xSearchOutput,
                        searches:
                          xSearchOutput.searches?.map((search) => ({
                            ...search,
                            query: search.query || '',
                            sources: search.sources?.filter((s): s is NonNullable<typeof s> => s !== null) || [],
                            citations: (search.citations ?? []).map(normalizeCitation).filter(Boolean),
                          })) || [],
                        dateRange: xSearchOutput.dateRange || '',
                        handles: xSearchOutput.handles || [],
                      }
                    : null
                }
                args={xSearchInput}
                annotations={annotations as DataQueryCompletionPart[]}
              />
            );
        }
        break;

      case 'tool-youtube_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={YoutubeIcon} text="Searching YouTube..." color="red" />;
          case 'output-available': {
            const parseLegacyCount = (value: unknown): number | undefined => {
              if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
              }
              if (typeof value === 'string') {
                const digits = value.replace(/[^0-9]/g, '');
                if (!digits) return undefined;
                const parsed = Number(digits);
                return Number.isFinite(parsed) ? parsed : undefined;
              }
              return undefined;
            };

            const normalizedResults = Array.isArray(part.output?.results)
              ? part.output.results.map((video) => {
                  if (!video) return video;
                  if (video.stats) return video;
                  const views = parseLegacyCount(video.views);
                  const likes = parseLegacyCount(video.likes);

                  if (views == null && likes == null) {
                    return video;
                  }

                  return {
                    ...video,
                    stats: {
                      ...(views != null ? { views } : {}),
                      ...(likes != null ? { likes } : {}),
                    },
                  };
                })
              : [];

            return (
              <YouTubeSearchResults
                results={{
                  ...(part.output ?? { results: [] }),
                  results: normalizedResults,
                }}
              />
            );
          }
        }
        break;

      case 'tool-spotify_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return (
              <SpotifySearchResults
                result={{
                  success: true,
                  query: part.input?.query || '',
                  searchTypes: ['track'],
                  tracks: [],
                  artists: [],
                  albums: [],
                  playlists: [],
                  totals: { tracks: 0, artists: 0, albums: 0, playlists: 0 },
                }}
                isLoading={true}
              />
            );
          case 'output-available':
            return <SpotifySearchResults result={part.output} />;
        }
        break;

      case 'tool-search_memories':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={MemoryIcon} text="Searching memories..." color="blue" />;
          case 'output-available':
            const { results, count } = part.output;
            if (!results || results.length === 0) {
              return (
                <ToolNotice tone="empty" icon={MemoryIcon} title="No memories found">
                  No memories match your search query. Try different keywords.
                </ToolNotice>
              );
            }

            return <MemoriesFoundCard count={count} results={results} />;
        }
        break;

      case 'tool-add_memory':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={MemoryIcon} text="Adding memory..." color="green" />;
          case 'output-available':
            // Handle error responses
            if (!part.output.success) {
              return (
                <ToolNotice tone="error" icon={MemoryIcon} title="Failed to add memory">
                  {part.output.error}
                </ToolNotice>
              );
            }

            const { memory: addedMemory } = part.output;
            return <MemoryAddedCard memory={addedMemory} />;
        }
        break;

      case 'tool-nearby_places_search':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <NearbySearchSkeleton type={part.input?.type || 'places'} />;
          case 'output-available':
            // Handle error cases or missing data
            if (!part.output.success || !part.output.center) {
              return (
                <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-lg">
                  <p className="text-red-700 dark:text-red-300">
                    {part.output.error ||
                      'Unable to find nearby places. Please try a different location or search term.'}
                  </p>
                </div>
              );
            }

            return (
              <NearbySearchMapView
                center={{
                  lat: part.output.center?.lat || 0,
                  lng: part.output.center?.lng || 0,
                }}
                places={
                  part.output.places?.map((place: any) => ({
                    name: place.name,
                    location: place.location,
                    place_id: place.place_id,
                    vicinity: place.formatted_address,
                    rating: place.rating,
                    reviews_count: place.reviews_count,
                    reviews: place.reviews,
                    price_level: place.price_level,
                    photos: place.photos,
                    is_closed: !place.is_open,
                    type: place.types?.[0]?.replace(/_/g, ' '),
                    source: place.source,
                    phone: place.phone,
                    website: place.website,
                    hours: place.opening_hours,
                    distance: place.distance,
                  })) || []
                }
                type={part.output.type || ''}
                query={part.output.query || ''}
                searchRadius={'radius' in part.output ? Number(part.output.radius) || 1000 : 1000}
              />
            );
        }
        break;

      case 'tool-currency_converter':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            return (
              <CurrencyConverter
                toolInvocation={{
                  toolName: 'currency_converter',
                  input: part.input || {},
                  result: part.output || null,
                }}
                result={part.output}
              />
            );
        }
        break;

      case 'tool-code_interpreter':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
          case 'output-available':
            return (
              <div className="space-y-3 w-full overflow-hidden">
                <CodeInterpreterView
                  code={part.input?.code || ''}
                  output={part.output?.message}
                  error={part.output && 'error' in part.output ? String(part.output.error) : undefined}
                  language="python"
                  title={part.input?.title || 'Code Execution'}
                  status={
                    part.output && 'error' in part.output && part.output.error
                      ? 'error'
                      : part.output
                        ? 'completed'
                        : 'running'
                  }
                />

                {part.output?.chart && (
                  <div className="pt-1 overflow-x-auto">
                    {part.output.chart.type === 'image' && part.output.chart.png ? (
                      <img
                        src={part.output.chart.png}
                        alt={part.output.chart.title || 'Chart'}
                        className="max-w-full rounded-lg"
                      />
                    ) : (
                      <InteractiveChart chart={part.output.chart} />
                    )}
                  </div>
                )}

                {part.output?.files && part.output.files.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-2">
                    {part.output.files.map((file, fileIndex) => (
                      <a
                        key={`${file.url}-${fileIndex}`}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                      >
                        <Download className="size-3.5" />
                        {file.filename}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
        }
        break;

      case 'tool-retrieve':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return (
              <div className="rounded-xl border border-border/60 my-4 overflow-hidden bg-card/30">
                {/* Header */}
                <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground/40 animate-pulse" />
                  <span className="font-pixel text-xs text-muted-foreground/80 uppercase tracking-wider">
                    Retrieving
                  </span>
                  <Spinner className="size-3 text-muted-foreground/40 ml-auto" />
                </div>
                <div className="p-4">
                  <div className="flex gap-3">
                    <div className="relative w-10 h-10 shrink-0 rounded-lg bg-muted/30 animate-pulse flex items-center justify-center">
                      <Globe className="h-4 w-4 text-muted-foreground/20" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="h-4 w-3/4 bg-muted/30 animate-pulse rounded" />
                      <div className="flex gap-2">
                        <div
                          className="h-3 w-20 bg-muted/20 animate-pulse rounded"
                          style={{ animationDelay: '50ms' }}
                        />
                        <div
                          className="h-3 w-28 bg-muted/20 animate-pulse rounded"
                          style={{ animationDelay: '100ms' }}
                        />
                      </div>
                      <div className="space-y-1">
                        <div
                          className="h-2.5 w-full bg-muted/20 animate-pulse rounded"
                          style={{ animationDelay: '150ms' }}
                        />
                        <div
                          className="h-2.5 w-4/5 bg-muted/15 animate-pulse rounded"
                          style={{ animationDelay: '200ms' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          case 'output-available':
            // Handle error responses
            if (part.output && 'error' in part.output && part.output.error && !part.output.results?.length) {
              return (
                <div className="border border-red-200 dark:border-red-500 rounded-xl my-4 p-4 bg-red-50 dark:bg-red-950/50">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                      <Globe className="h-4 w-4 text-red-600 dark:text-red-300" />
                    </div>
                    <div>
                      <div className="text-red-700 dark:text-red-300 text-sm font-medium">Error retrieving content</div>
                      <div className="text-red-600/80 dark:text-red-400/80 text-xs mt-1">
                        {String(part.output.error)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Use the new RetrieveResults component for both single and multi-URL
            return <RetrieveResults result={part.output} />;
        }
        break;

      case 'tool-coin_ohlc':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={TrendingUpIcon} text="Loading OHLC candlestick data..." color="green" />;
          case 'output-available':
            return <CryptoChart result={part.output} coinId={part.input.coinId} chartType="candlestick" />;
        }
        break;

      case 'tool-coin_data':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={DollarSign} text="Fetching comprehensive coin data..." color="blue" />;
          case 'output-available':
            return <CryptoCoinsData result={part.output} />;
        }
        break;

      case 'tool-coin_data_by_contract':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={DollarSign} text="Fetching token data by contract..." color="violet" />;
          case 'output-available':
            return <CryptoCoinsData result={part.output} />;
        }
        break;

      case 'tool-greeting':
        switch (part.state) {
          case 'input-streaming':
          case 'input-available':
            return <SearchLoadingState icon={User2} text="Preparing greeting..." color="gray" />;
          case 'output-available':
            return (
              <div className="group my-2 rounded-md border border-neutral-200/60 dark:border-neutral-700/60 bg-white/80 dark:bg-neutral-900/80 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all duration-200">
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    {part.output.timeEmoji && (
                      <div className="mt-0.5 w-5 h-5 rounded-md bg-neutral-600 flex items-center justify-center">
                        <span className="text-xs">{part.output.timeEmoji}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {part.output.greeting}
                        </span>
                        <span className="text-neutral-400">•</span>
                        <span className="text-neutral-500 dark:text-neutral-400">{part.output.dayOfWeek}</span>
                      </div>
                      <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        {part.output.professionalMessage}
                      </div>
                      {part.output.helpfulTip && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{part.output.helpfulTip}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
        }
        break;
      case 'tool-skill': {
        if (part.state === 'output-available') {
          const loadedSkills = (part.output as { loadedSkills?: Array<{ id: string; name: string }> } | undefined)
            ?.loadedSkills;
          const label =
            !loadedSkills || loadedSkills.length === 0
              ? 'Learned skill'
              : loadedSkills.length === 1
                ? `Learned ${loadedSkills[0].name}`
                : `Learned ${loadedSkills.map((s) => s.name).join(', ')}`;
          return (
            <div className="my-2 inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3 shrink-0" strokeWidth={2} />
              <span>{label}</span>
            </div>
          );
        }
        return <SearchLoadingState icon={Sparkles} text="Loading skill..." color="blue" />;
      }

      case 'tool-generate_image': {
        const generatedImageUrl =
          part.state === 'output-available' && part.output.success ? part.output.imageUrl : undefined;
        return (
          <GeneratedImageCard
            mode="generate"
            state={toImageCardState(part.state)}
            prompt={part.input?.prompt}
            size={part.input?.size}
            imageUrl={generatedImageUrl}
            error={
              part.state === 'output-available' && !part.output.success
                ? part.output.error
                : part.state === 'output-error'
                  ? part.errorText
                  : undefined
            }
            isHidden={generatedImageUrl ? hiddenImageUrls?.has(generatedImageUrl) : undefined}
            canToggleHidden={chatId ? canEdit : false}
            onToggleHidden={
              generatedImageUrl && chatId
                ? (hidden: boolean) => onToggleImageHidden?.(generatedImageUrl, hidden)
                : undefined
            }
          />
        );
      }

      case 'tool-edit_image': {
        const editedImageUrl =
          part.state === 'output-available' && part.output.success ? part.output.imageUrl : undefined;
        return (
          <GeneratedImageCard
            mode="edit"
            state={toImageCardState(part.state)}
            prompt={part.input?.prompt}
            sourceImageUrl={
              (part.state === 'output-available' && part.output.success ? part.output.originalUrl : undefined) ??
              part.input?.image_url
            }
            imageUrl={editedImageUrl}
            error={
              part.state === 'output-available' && !part.output.success
                ? part.output.error
                : part.state === 'output-error'
                  ? part.errorText
                  : undefined
            }
            isHidden={editedImageUrl ? hiddenImageUrls?.has(editedImageUrl) : undefined}
            canToggleHidden={chatId ? canEdit : false}
            onToggleHidden={
              editedImageUrl && chatId ? (hidden: boolean) => onToggleImageHidden?.(editedImageUrl, hidden) : undefined
            }
          />
        );
      }

      default:
        return <DynamicToolInvocationCard part={part} compact={true} />;
    }
  } else {
    // Tool part without a state field: dump it raw
    console.warn('Legacy tool part without state:', part);
    return (
      <div className="my-4 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
        <h3 className="font-medium mb-2">Tool: Unknown</h3>
        <pre className="text-xs overflow-auto">{JSON.stringify(part, null, 2)}</pre>
      </div>
    );
  }
}
