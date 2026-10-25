import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/env/server', () => ({ serverEnv: {} }));

const providerMocks = vi.hoisted(() => ({
  runExtremeSearchProvider: vi.fn(),
  runExtremeContentExtraction: vi.fn(),
}));
vi.mock('@/lib/tools/extreme-search/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tools/extreme-search/providers')>()),
  ...providerMocks,
}));

import type { ExtremeProviderStack } from '@/lib/tools/extreme-search/providers';
import type { AgentToolContext, ExtremeSearchEvent } from '@/lib/tools/extreme-search/agent-tools/context';
import { createWebSearchTool } from '@/lib/tools/extreme-search/agent-tools/web-search';
import { createDoneTool } from '@/lib/tools/extreme-search/agent-tools/done';
import { decodeHtmlEntities, findMissingPythonPackages } from '@/lib/tools/extreme-search/agent-tools/code-runner';
import { buildAgentSystemPrompt, buildPlannerPrompt } from '@/lib/tools/extreme-search/prompts';
import type { SearchResult } from '@/lib/tools/self-hosted-content';

function createContext() {
  const events: ExtremeSearchEvent[] = [];
  const sources: SearchResult[] = [];
  const context: AgentToolContext = {
    emit: (event) => events.push(event),
    collectSources: (...collected) => sources.push(...collected),
  };
  return { context, events, sources };
}

const stack: ExtremeProviderStack = {
  searchProvider: 'searxng',
  searchFallbackProvider: 'exa',
  contentProvider: 'fastcrw',
  contentFallbackProvider: null,
  metadataEnabled: true,
  clients: {} as ExtremeProviderStack['clients'],
};

const callOptions = { toolCallId: 'call-1', messages: [] };

function link(url: string): SearchResult {
  return { title: url, url, content: '', publishedDate: '', favicon: '' };
}

describe('webSearch agent tool', () => {
  beforeEach(() => {
    providerMocks.runExtremeSearchProvider.mockReset();
    providerMocks.runExtremeContentExtraction.mockReset();
  });

  it('falls back to the second provider when the first finds nothing, then reads the pages', async () => {
    providerMocks.runExtremeSearchProvider.mockResolvedValueOnce([]).mockResolvedValueOnce([link('https://a.test')]);
    providerMocks.runExtremeContentExtraction.mockResolvedValue([
      { ...link('https://a.test'), title: 'A', content: 'full page' },
    ]);
    const { context, events, sources } = createContext();

    const output = await createWebSearchTool(context, stack).execute!({ queries: ['q'] }, callOptions);

    expect(providerMocks.runExtremeSearchProvider.mock.calls.map((call) => call[0])).toEqual(['searxng', 'exa']);
    expect(output).toEqual({
      searches: [
        {
          query: 'q',
          results: [{ title: 'A', url: 'https://a.test', content: 'full page', publishedDate: '', favicon: '' }],
        },
      ],
    });
    expect(sources.map((s) => s.url)).toEqual(['https://a.test']);
    expect(events.filter((e) => e.kind === 'query').map((e) => 'status' in e && e.status)).toEqual([
      'started',
      'reading_content',
      'completed',
    ]);
  });

  it('keeps the search snippets when the pages cannot be read', async () => {
    providerMocks.runExtremeSearchProvider.mockResolvedValue([{ ...link('https://b.test'), content: 'snippet' }]);
    providerMocks.runExtremeContentExtraction.mockRejectedValue(new Error('down'));
    const { context } = createContext();

    const output = await createWebSearchTool(context, stack).execute!({ queries: ['q'] }, callOptions);

    expect(output).toMatchObject({ searches: [{ results: [{ url: 'https://b.test', content: 'snippet' }] }] });
  });

  it('reports why a query failed instead of returning it as empty', async () => {
    providerMocks.runExtremeSearchProvider
      .mockRejectedValueOnce(new Error('SearXNG returned 500'))
      .mockRejectedValueOnce(new Error('quota exceeded'));
    const { context, events } = createContext();

    const output = await createWebSearchTool(context, stack).execute!({ queries: ['q'] }, callOptions);

    const error = 'SearXNG failed: SearXNG returned 500; Exa failed: quota exceeded';
    expect(output).toEqual({ searches: [{ query: 'q', results: [], error }] });
    expect(providerMocks.runExtremeContentExtraction).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: 'query', status: 'error', error });
  });

  it('drops the primary error when the fallback finds results', async () => {
    providerMocks.runExtremeSearchProvider
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce([link('https://a.test')]);
    providerMocks.runExtremeContentExtraction.mockResolvedValue([]);
    const { context } = createContext();

    const output = await createWebSearchTool(context, stack).execute!({ queries: ['q'] }, callOptions);

    expect(output).toEqual({ searches: [{ query: 'q', results: [link('https://a.test')] }] });
  });

  it('skips reading content for a query without results', async () => {
    providerMocks.runExtremeSearchProvider.mockResolvedValue([]);
    const { context, events } = createContext();

    await createWebSearchTool(context, { ...stack, searchFallbackProvider: null }).execute!(
      { queries: ['q'] },
      callOptions,
    );

    expect(providerMocks.runExtremeContentExtraction).not.toHaveBeenCalled();
    expect(events.map((e) => 'status' in e && e.status)).toEqual(['started', 'completed']);
  });
});

describe('done agent tool', () => {
  it('streams the summary', async () => {
    const { context, events } = createContext();
    const output = await createDoneTool(context).execute!({ summary: 'Found it.' }, callOptions);
    expect(output).toEqual({ done: true, summary: 'Found it.' });
    expect(events).toEqual([{ kind: 'done', summary: 'Found it.' }]);
  });
});

describe('codeRunner helpers', () => {
  it('decodes HTML-escaped code', () => {
    expect(decodeHtmlEntities('if a &lt; b &amp;&amp; c &gt; d: print(&quot;x&#39;s&quot;)')).toBe(
      `if a < b && c > d: print("x's")`,
    );
  });

  it('lists imported packages the sandbox does not ship', () => {
    const code = 'import numpy as np\nfrom polars import DataFrame\n  import tqdm.auto\nimport pandas';
    expect(findMissingPythonPackages(code)).toEqual(['polars', 'tqdm']);
  });
});

describe('research prompts', () => {
  it('quote the step budget they are given', () => {
    const plan = [{ title: 'A research topic title', todos: ['a', 'b', 'c'] }];
    const agentPrompt = buildAgentSystemPrompt(plan, { fileNames: [], maxSteps: 25 });
    const plannerPrompt = buildPlannerPrompt('topic', { fileNames: [], maxSteps: 25 });
    for (const prompt of [agentPrompt, plannerPrompt]) {
      expect(prompt).toContain('25');
      expect(prompt).not.toContain('75');
    }
  });

  it('mention the uploaded files only when there are some', () => {
    const plan = [{ title: 'A research topic title', todos: ['a', 'b', 'c'] }];
    expect(buildAgentSystemPrompt(plan, { fileNames: ['report.pdf'], maxSteps: 75 })).toContain(
      'You have access to uploaded files: report.pdf',
    );
    expect(buildAgentSystemPrompt(plan, { fileNames: [], maxSteps: 75 })).not.toContain('FILE QUERY SEARCH');
  });
});
