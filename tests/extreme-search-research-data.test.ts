import { describe, it, expect } from 'vitest';

import { combineFileQueries, deriveResearchView } from '@/components/extreme-search/research-data';
import type { DataExtremeSearchPart } from '@/lib/types';

const event = (data: DataExtremeSearchPart['data']): DataExtremeSearchPart => ({ type: 'data-extreme_search', data });

const plan = [{ title: 'Find the release notes', todos: ['a', 'b', 'c'] }];

describe('deriveResearchView', () => {
  it('starts with the planning status and no steps', () => {
    expect(deriveResearchView([])).toMatchObject({
      isCompleted: false,
      currentStatus: 'Initializing...',
      timelineItems: [],
    });
    expect(deriveResearchView([event({ kind: 'plan', status: { title: 'Planning research' } })])).toMatchObject({
      currentStatus: 'Planning research...',
      plan: null,
    });
  });

  it('builds the timeline in streaming order, grouping the queries of one tool call', () => {
    const view = deriveResearchView([
      event({ kind: 'plan', status: { title: 'Research plan ready' }, plan }),
      event({ kind: 'thinking', thinkingId: 't1', thought: 'Look it up.', nextStep: 'Searching for the release' }),
      event({ kind: 'query', queryId: 'call1-0', query: 'rust release', index: 0, total: 2, status: 'started' }),
      event({ kind: 'query', queryId: 'call1-1', query: 'rust blog', index: 1, total: 2, status: 'started' }),
      event({ kind: 'source', queryId: 'call1-0', source: { title: 'Blog', url: 'https://blog.test/a' } }),
      event({ kind: 'source', queryId: 'call1-1', source: { title: 'Blog', url: 'https://blog.test/a' } }),
      event({
        kind: 'content',
        queryId: 'call1-0',
        content: { title: 'Blog', url: 'https://blog.test/a', text: 'Full text' },
      }),
      event({ kind: 'query', queryId: 'call1-0', query: 'rust release', index: 0, total: 2, status: 'completed' }),
    ]);

    expect(view.timelineItems.map((item) => item.kind)).toEqual(['thinking', 'query_group']);
    const group = view.timelineItems[1];
    expect(group.kind === 'query_group' && group.item.queries.map((q) => q.status)).toEqual(['completed', 'started']);
    expect(group.kind === 'query_group' && group.item.queries[0].sources[0].content).toBe('Full text');
    expect(view.sources.map((s) => s.url)).toEqual(['https://blog.test/a']);
    expect(view.currentStatus).toBe('Analyzing results...');
  });

  it('is completed once the agent calls done, and hides the plan', () => {
    const view = deriveResearchView([
      event({ kind: 'plan', status: { title: 'Research plan ready' }, plan }),
      event({ kind: 'done', summary: 'Found it.' }),
    ]);
    expect(view).toMatchObject({ isCompleted: true, currentStatus: 'Research completed', plan: null });
    expect(view.timelineItems).toEqual([{ kind: 'done', item: { id: 'done-0', summary: 'Found it.' } }]);
  });

  it('keeps browsed page results when a later event carries none', () => {
    const view = deriveResearchView([
      event({
        kind: 'browse_page',
        browseId: 'b1',
        urls: ['https://a.test'],
        index: 0,
        total: 1,
        status: 'completed',
        results: [{ url: 'https://a.test', title: 'A', content: 'text' }],
      }),
      event({ kind: 'browse_page', browseId: 'b1', urls: ['https://a.test'], index: 0, total: 1, status: 'completed' }),
    ]);
    const step = view.timelineItems[0];
    expect(step.kind === 'browse_page_group' && step.item.executions[0].results).toHaveLength(1);
  });

  it('collects chart outputs from code runs', () => {
    const view = deriveResearchView([
      event({ kind: 'code', codeId: 'c1', title: 'Plot', code: 'x', status: 'completed', charts: [{ url: 'u' }] }),
    ]);
    expect(view.charts).toEqual([{ url: 'u' }]);
  });
});

describe('combineFileQueries', () => {
  it('merges duplicate passages across queries', () => {
    const passage = { fileName: 'a.pdf', content: 'same passage', score: 0.9 };
    expect(
      combineFileQueries([
        { id: 'f-0', query: 'q1', status: 'completed', results: [passage] },
        { id: 'f-1', query: 'q2', status: 'completed', results: [passage] },
        { id: 'f-2', query: 'q3', status: 'started' },
      ]),
    ).toEqual({ results: [passage], queries: ['q1', 'q2'] });
  });
});
