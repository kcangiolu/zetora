import { describe, it, expect } from 'vitest';
import {
  isSearchGroupAvailable,
  pickFallbackSearchProvider,
  pickSearchProvider,
  searchProvidersFor,
} from '@/lib/search/providers';

describe('pickSearchProvider', () => {
  it("keeps the user's choice when the instance has it", () => {
    expect(pickSearchProvider('web', 'parallel', ['exa', 'firecrawl', 'parallel'])).toBe('parallel');
  });

  it('defaults to Exa, then Firecrawl, then Parallel for web search', () => {
    expect(pickSearchProvider('web', undefined, ['parallel', 'firecrawl', 'exa'])).toBe('exa');
    expect(pickSearchProvider('web', undefined, ['parallel', 'firecrawl'])).toBe('firecrawl');
    expect(pickSearchProvider('web', undefined, ['parallel'])).toBe('parallel');
  });

  it('puts the self-hosted services first when the instance runs them', () => {
    expect(pickSearchProvider('web', undefined, ['exa', 'searxng'])).toBe('searxng');
    expect(pickSearchProvider('retrieve', undefined, ['exa', 'fastcrw'])).toBe('fastcrw');
  });

  it('replaces a choice the instance does not have', () => {
    expect(pickSearchProvider('web', 'searxng', ['exa'])).toBe('exa');
  });

  it('ignores providers that cannot serve the function', () => {
    // GitHub search has no Exa or Parallel: only Firecrawl among the APIs.
    expect(pickSearchProvider('github', 'exa', ['exa', 'parallel', 'firecrawl'])).toBe('firecrawl');
    expect(pickSearchProvider('github', undefined, ['exa', 'parallel'])).toBeNull();
    expect(searchProvidersFor('reddit', ['exa', 'firecrawl'])).toEqual(['firecrawl']);
  });
});

describe('pickFallbackSearchProvider', () => {
  it('never returns the primary provider', () => {
    expect(pickFallbackSearchProvider('web', 'exa', 'exa', ['exa', 'firecrawl'])).toBe('firecrawl');
    expect(pickFallbackSearchProvider('web', undefined, 'exa', ['exa'])).toBeNull();
  });
});

describe('isSearchGroupAvailable', () => {
  it('hides a source the instance cannot run, and search sources with no provider', () => {
    const capabilities = { searchProviders: ['exa' as const], unavailableSources: ['x'] };
    expect(isSearchGroupAvailable('x', capabilities)).toBe(false);
    expect(isSearchGroupAvailable('web', capabilities)).toBe(true);
    expect(isSearchGroupAvailable('reddit', capabilities)).toBe(false);
    expect(isSearchGroupAvailable('youtube', capabilities)).toBe(true);
  });

  it('hides search sources while the capabilities load', () => {
    expect(isSearchGroupAvailable('web', undefined)).toBe(false);
    expect(isSearchGroupAvailable('chat', undefined)).toBe(true);
  });
});
