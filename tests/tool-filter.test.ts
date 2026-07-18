import { describe, it, expect } from 'vitest';
import { filterActiveTools, getEnabledSkillIds } from '@/lib/search/tool-filter';
import { getAllSkillIds } from '@/lib/skills/registry';

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
  isSignedIn: true,
  isMaxUser: true,
  preferences: undefined,
  sessionEnabledSources: undefined,
};

describe('filterActiveTools', () => {
  it('keeps everything for a signed-in Max user with no source preference', () => {
    expect(filterActiveTools(base)).toEqual(baseTools);
  });

  it('strips image tools for non-Max users, in special modes too', () => {
    expect(filterActiveTools({ ...base, isMaxUser: false })).not.toEqual(expect.arrayContaining(['generate_image']));
    const mcp = filterActiveTools({ ...base, isMaxUser: false, specialMode: 'mcp' });
    expect(mcp).not.toContain('generate_image');
    expect(mcp).not.toContain('edit_image');
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

  it('skips narrowing entirely when the session/global intersection is empty', () => {
    // Matches the route's long-standing guard: an empty enabledSources list
    // means "no narrowing", not "no tools".
    const result = filterActiveTools({
      ...base,
      preferences: { 'zetora-enabled-sources': ['web'] },
      sessionEnabledSources: ['reddit'],
    });
    expect(result).toEqual(baseTools);
  });

  it('never offers extreme_search to signed-out users', () => {
    const result = filterActiveTools({ ...base, isSignedIn: false });
    expect(result).not.toContain('extreme_search');
    expect(result).toContain('web_search');
  });

  it('skips source narrowing and the extreme_search gate in special modes', () => {
    const result = filterActiveTools({
      ...base,
      specialMode: 'memory',
      isSignedIn: false,
      preferences: { 'zetora-enabled-sources': ['web'] },
    });
    expect(result).toContain('reddit_search');
    expect(result).toContain('extreme_search');
  });

  it('does not mutate the input tools array', () => {
    const tools = [...baseTools];
    filterActiveTools({ ...base, tools, isMaxUser: false });
    expect(tools).toEqual(baseTools);
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
