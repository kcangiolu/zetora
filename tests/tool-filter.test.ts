import { describe, it, expect } from 'vitest';
import { filterActiveTools, getEnabledSkillIds } from '@/lib/search/tool-filter';
import { getAllSkillIds } from '@/lib/skills/registry';
import { tools as autoTools } from '@/lib/search/groups/auto';

const baseTools = [
  'web_search',
  'reddit_search',
  'x_search',
  'retrieve',
  'datetime',
  'extreme_search',
  'generate_image',
  'edit_image',
];

const base = {
  tools: baseTools,
  specialMode: undefined,
  preferences: undefined,
  sessionEnabledSources: undefined,
};

describe('filterActiveTools', () => {
  it('keeps everything with no source preference — any connected account gets every tool', () => {
    expect(filterActiveTools(base)).toEqual(baseTools);
  });

  it('narrows tools to globally enabled sources, keeping group-less utilities', () => {
    const result = filterActiveTools({ ...base, preferences: { 'zetora-enabled-sources': ['web'] } });
    expect(result).toContain('web_search');
    expect(result).not.toContain('reddit_search');
    expect(result).not.toContain('x_search');
    // Tools without an owning group in toolGroupMap always survive.
    expect(result).toContain('retrieve');
    expect(result).toContain('datetime');
    expect(result).toContain('extreme_search');
  });

  it('falls back to the legacy zetora-visible-modes key', () => {
    const result = filterActiveTools({ ...base, preferences: { 'zetora-visible-modes': ['reddit'] } });
    expect(result).toContain('reddit_search');
    expect(result).not.toContain('web_search');
  });

  it('applies a session-only override when no global preference exists', () => {
    const result = filterActiveTools({ ...base, sessionEnabledSources: ['x'] });
    expect(result).toContain('x_search');
    expect(result).not.toContain('web_search');
  });

  it('intersects session override with the global preference', () => {
    const result = filterActiveTools({
      ...base,
      preferences: { 'zetora-enabled-sources': ['web', 'reddit'] },
      sessionEnabledSources: ['reddit', 'x'],
    });
    expect(result).toContain('reddit_search');
    expect(result).not.toContain('web_search');
    expect(result).not.toContain('x_search');
  });

  it('drops every source-gated tool when the session/global intersection is empty', () => {
    // The session override is explicit, so a non-overlapping intersection means
    // "no sources enabled this session" (chat only), not "skip narrowing".
    const result = filterActiveTools({
      ...base,
      preferences: { 'zetora-enabled-sources': ['web'] },
      sessionEnabledSources: ['reddit'],
    });
    expect(result).not.toContain('web_search');
    expect(result).not.toContain('reddit_search');
    // Tools without an owning group in toolGroupMap always survive.
    expect(result).toContain('retrieve');
    expect(result).toContain('datetime');
    expect(result).toContain('extreme_search');
  });

  it('drops every source-gated tool when the user explicitly unchecks all sources', () => {
    const result = filterActiveTools({ ...base, sessionEnabledSources: [] });
    expect(result).not.toContain('web_search');
    expect(result).not.toContain('reddit_search');
    expect(result).not.toContain('x_search');
    expect(result).toContain('retrieve');
    expect(result).toContain('datetime');
    expect(result).toContain('extreme_search');
  });

  it('skips source narrowing in special modes', () => {
    const result = filterActiveTools({
      ...base,
      specialMode: 'connectors',
      preferences: { 'zetora-enabled-sources': ['web'] },
    });
    expect(result).toContain('reddit_search');
    expect(result).toContain('extreme_search');
  });

  it('does not mutate the input tools array', () => {
    const tools = [...baseTools];
    filterActiveTools({ ...base, tools });
    expect(tools).toEqual(baseTools);
  });
});

describe('filterActiveTools - skill-owned tools', () => {
  it('drops a tool owned solely by a disabled skill', () => {
    const active = filterActiveTools({
      tools: autoTools,
      specialMode: undefined,
      preferences: { 'zetora-disabled-skills': ['image-editing'] },
      sessionEnabledSources: undefined,
    });
    expect(active).not.toContain('edit_image');
    // Sibling skill's tool must survive - each image tool is gated independently.
    expect(active).toContain('generate_image');
  });

  it('keeps a source-gated tool available even if its skill is disabled', () => {
    // stock_chart is source-gated via toolGroupMap ('stocks'), so market-intel
    // being disabled must not remove it - the Sources toggle already owns that.
    const active = filterActiveTools({
      tools: autoTools,
      specialMode: undefined,
      preferences: { 'zetora-disabled-skills': ['market-intel'] },
      sessionEnabledSources: undefined,
    });
    expect(active).toContain('stock_chart');
  });

  it('keeps a tool shared by several skills even if one owner is disabled', () => {
    const active = filterActiveTools({
      tools: autoTools,
      specialMode: undefined,
      preferences: { 'zetora-disabled-skills': ['local-guide'] },
      sessionEnabledSources: undefined,
    });
    expect(active).toContain('web_search');
    // But a tool solely owned by local-guide, and not source-gated, is dropped.
    expect(active).not.toContain('get_weather_data');
  });

  it('applies skill gating even under a special mode', () => {
    const active = filterActiveTools({
      tools: autoTools,
      specialMode: 'canvas',
      preferences: { 'zetora-disabled-skills': ['image-editing'] },
      sessionEnabledSources: undefined,
    });
    expect(active).not.toContain('edit_image');
  });
});

describe('getEnabledSkillIds', () => {
  it('returns every skill when nothing is disabled', () => {
    expect(getEnabledSkillIds(undefined)).toEqual(getAllSkillIds());
    expect(getEnabledSkillIds({})).toEqual(getAllSkillIds());
  });

  it('filters out disabled skills', () => {
    const all = getAllSkillIds();
    const disabled = all[0];
    const result = getEnabledSkillIds({ 'zetora-disabled-skills': [disabled] });
    expect(result).not.toContain(disabled);
    expect(result).toHaveLength(all.length - 1);
  });
});
