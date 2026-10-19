// Deep research: a planner model breaks the topic into a research plan, then an agent model
// works through it with search, browsing, X, file and code tools until it calls done. The tool
// returns every source the agent read and the charts it drew.

import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { Output, generateText, hasToolCall, stepCountIs, tool } from 'ai';
import type { UIMessageStreamWriter } from 'ai';
import { z } from 'zod';

import { getFileEmbeddingModel } from '@/ai/embeddings';
import { resolveTertiaryModel } from '@/ai/tertiary';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { isToolAvailable } from '@/lib/instance/capabilities';
import { createLogger } from '@/lib/logger';
import { EXTREME_WALL_CLOCK_MS, isPastDeadline } from '@/lib/timeouts';
import {
  buildFileRetrievers,
  getFileDisplayName,
  isSearchableFile,
  type FileContext,
  type FileRetrievers,
} from '@/lib/tools/file-retrieval';
import { BROWSE_PAGE_CONTENT_MAX_CHARS, type SearchResult } from '@/lib/tools/self-hosted-content';
import type { ChatMessage } from '@/lib/types';

import { createBrowsePageTool } from './agent-tools/browse-page';
import { createCodeRunnerTool } from './agent-tools/code-runner';
import type { AgentToolContext } from './agent-tools/context';
import { createDoneTool } from './agent-tools/done';
import { createFileQueryTool } from './agent-tools/file-query';
import { createThinkingTool } from './agent-tools/thinking';
import { createWebSearchTool } from './agent-tools/web-search';
import { createXSearchTool } from './agent-tools/x-search';
import { buildAgentSystemPrompt, buildPlannerPrompt, researchPlanSchema } from './prompts';
import { resolveExtremeProviderStack } from './providers';

const log = createLogger('extreme-search');

// Local custom models are far slower per step (single-slot llama.cpp, full prompt
// re-processing every round), so they get a tighter step budget.
const AGENT_MAX_STEPS = 75;
const CUSTOM_AGENT_MAX_STEPS = 25;

const SOURCE_CONTENT_MAX_CHARS = 3000;

type Research = {
  toolResults: any[];
  sources: SearchResult[];
  charts: any[];
};

async function extremeSearch(
  prompt: string,
  dataStream: UIMessageStreamWriter<ChatMessage> | undefined,
  files: FileContext[] = [],
  preferences: UserPreferenceValues | null = null,
  abortSignal?: AbortSignal,
): Promise<Research> {
  const allSources: SearchResult[] = [];
  const context: AgentToolContext = {
    emit: (data) => dataStream?.write({ type: 'data-extreme_search', data }),
    collectSources: (...sources) => allSources.push(...sources),
  };

  const providerStack = resolveExtremeProviderStack(preferences);
  log.info(
    `Extreme search stack — search: ${providerStack.searchProvider} (fallback: ${providerStack.searchFallbackProvider ?? 'none'}), content: ${providerStack.contentProvider} (fallback: ${providerStack.contentFallbackProvider ?? 'none'})`,
  );

  const isCustomAgentModel = Boolean(
    preferences?.['zetora-tertiary-extreme-agent-model']?.toString()?.startsWith('custom-'),
  );
  const maxSteps = isCustomAgentModel ? CUSTOM_AGENT_MAX_STEPS : AGENT_MAX_STEPS;

  const supportedFiles = files.filter(isSearchableFile);

  context.emit({ kind: 'plan', status: { title: 'Planning research' } });

  const {
    output: { plan },
  } = await generateText({
    model: await resolveTertiaryModel('extreme-planner', preferences),
    abortSignal,
    output: Output.object({ schema: researchPlanSchema }),
    prompt: buildPlannerPrompt(prompt, { fileNames: supportedFiles.map(getFileDisplayName), maxSteps }),
  });

  log.debug('Research plan:', plan);
  log.info(`Total todos: ${plan.reduce((acc, curr) => acc + curr.todos.length, 0)}`);
  context.emit({ kind: 'plan', status: { title: 'Research plan ready, starting up research agent' }, plan });

  let fileRetrievers: FileRetrievers = new Map();
  if (supportedFiles.length > 0) {
    log.info(`Indexing ${supportedFiles.length} files for file query search`);
    fileRetrievers = await buildFileRetrievers(supportedFiles, await getFileEmbeddingModel(preferences));
  }
  const hasFiles = supportedFiles.length > 0 && fileRetrievers.size > 0;

  const tools = {
    thinking: createThinkingTool(context),
    ...(hasFiles
      ? { fileQuery: createFileQueryTool(context, { files: supportedFiles, retrievers: fileRetrievers }) }
      : {}),
    codeRunner: createCodeRunnerTool(context),
    webSearch: createWebSearchTool(context, providerStack),
    browsePage: createBrowsePageTool(context, providerStack),
    xSearch: createXSearchTool(context),
    done: createDoneTool(context),
  };
  const activeTools = [
    'codeRunner' as const,
    'webSearch' as const,
    'browsePage' as const,
    ...(isToolAvailable('x_search') ? (['xSearch'] as const) : []),
    'thinking' as const,
    ...(hasFiles ? (['fileQuery'] as const) : []),
    'done' as const,
  ];

  const toolResults: any[] = [];
  // A wall-clock deadline too, so a run can never grow unbounded.
  const agentDeadline = EXTREME_WALL_CLOCK_MS > 0 ? Date.now() + EXTREME_WALL_CLOCK_MS : Number.POSITIVE_INFINITY;

  await generateText({
    model: await resolveTertiaryModel('extreme-agent', preferences),
    // Stop in the chat aborts the whole run, the agent's tool calls included.
    abortSignal,
    stopWhen: [stepCountIs(maxSteps), hasToolCall('done'), () => isPastDeadline(agentDeadline)],
    activeTools,
    maxRetries: 2,
    system: buildAgentSystemPrompt(plan, {
      fileNames: hasFiles ? supportedFiles.map(getFileDisplayName) : [],
      maxSteps,
    }),
    prompt,
    temperature: 0,
    // Thinking is switched off for this model (ai/tertiary.ts): every step
    // forces toolChoice 'required', which several providers reject while
    // thinking.
    providerOptions: {
      xai: {
        parallel_function_calling: false,
        parallel_tool_calls: false,
      },
      openai: {
        parallelToolCalls: false,
      } satisfies OpenAIResponsesProviderOptions,
      anthropic: {
        disableParallelToolUse: true,
      } satisfies AnthropicProviderOptions,
    },
    tools,
    onStepFinish: (step) => {
      log.debug('Step finished:', step);
      if (step.toolResults) {
        toolResults.push(...step.toolResults);
      }
    },
    onFinish: (event) => {
      log.debug('Research agent finished', {
        finishReason: event.finishReason,
        steps: event.steps,
        toolCalls: event.toolCalls,
        toolResults: event.toolResults,
        response: event.response,
        providerMetadata: event.providerMetadata,
      });
    },
    // The model can only stop by calling done: it must call a tool at every step.
    prepareStep: async () => ({ toolChoice: 'required' as const }),
  });

  context.emit({ kind: 'plan', status: { title: 'Research completed' } });

  const chartResults = toolResults.filter((result) => {
    const output = result.output ?? result.result;
    return result.toolName === 'codeRunner' && typeof output === 'object' && output !== null && 'charts' in output;
  });

  log.debug('Chart results:', chartResults);

  const charts = chartResults.flatMap((result) => {
    const output = (result.output ?? result.result) as any;
    const codeTitle = output.title as string | undefined;
    return (output.charts || []).map((chart: { url: string; title?: string }, i: number) => ({
      ...chart,
      title:
        chart.title && !chart.title.startsWith('Chart ') ? chart.title : codeTitle || chart.title || `Chart ${i + 1}`,
    }));
  });

  log.debug('Final research results', { toolResults, charts, sampleSource: allSources[2] });

  return {
    toolResults,
    sources: Array.from(
      new Map(
        allSources.map((s) => {
          const maxChars = s.fullContent ? BROWSE_PAGE_CONTENT_MAX_CHARS : SOURCE_CONTENT_MAX_CHARS;
          const truncated = s.content.length > maxChars;
          return [s.url, { ...s, content: s.content.slice(0, maxChars) + (truncated ? '...' : '') }];
        }),
      ).values(),
    ),
    charts,
  };
}

export function extremeSearchTool(
  dataStream: UIMessageStreamWriter<ChatMessage> | undefined,
  files: Array<{ url: string; contentType: string; name?: string }> = [],
) {
  return tool({
    description: `Use this tool to conduct an extreme search on a given topic: plans the research, runs many searches and reads the sources.${files.length > 0 ? ` Has access to ${files.length} uploaded file(s) for document search.` : ''}`,
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          "This should take the user's exact prompt. Extract from the context but do not infer or change in any way.",
        ),
    }),
    execute: async ({ prompt }, { experimental_context, abortSignal }) => {
      log.debug('extremeSearch called', { prompt, filesCount: files.length });

      const ctx = experimental_context as { userPreferences?: Record<string, string> } | undefined;
      const extremePrefs = ctx?.userPreferences ?? null;
      const research = await extremeSearch(prompt, dataStream, files, extremePrefs, abortSignal);

      return {
        research: {
          sources: research.sources,
          charts: research.charts,
        },
      };
    },
  });
}
