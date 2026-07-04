import { describe, it, expect } from 'vitest';
import { normalizeError, getWebSearchDescription, getSearchGroups, cn } from '@/lib/utils';

describe('normalizeError', () => {
  it('maps websocket failures to a connection message', () => {
    expect(normalizeError(new Error('WebSocket 1006 closed'))).toMatch(/Connection lost/);
  });

  it('maps auth/token errors to an authorization message', () => {
    expect(normalizeError('403 forbidden token')).toMatch(/Authorization failed/);
  });

  it('maps timeouts', () => {
    expect(normalizeError(new Error('request timed out'))).toMatch(/took too long/);
  });

  it('maps network errors', () => {
    expect(normalizeError(new Error('fetch failed ECONNREFUSED'))).toMatch(/Could not connect/);
  });

  it('falls back to a generic message', () => {
    expect(normalizeError(new Error('some unknown thing'))).toMatch(/Something went wrong/);
  });

  it('handles null and undefined without throwing', () => {
    expect(normalizeError(null)).toMatch(/Something went wrong/);
    expect(normalizeError(undefined)).toMatch(/Something went wrong/);
  });
});

describe('getWebSearchDescription', () => {
  it('defaults to Exa', () => {
    expect(getWebSearchDescription()).toContain('Exa');
  });

  it('reflects the selected provider', () => {
    expect(getWebSearchDescription('searxng')).toContain('SearXNG');
    expect(getWebSearchDescription('fastcrw')).toContain('fastCRW');
  });
});

describe('getSearchGroups', () => {
  it('injects the provider name into the web group description', () => {
    const groups = getSearchGroups('parallel');
    const web = groups.find((g) => g.id === 'web');
    expect(web?.description).toContain('Parallel AI');
  });

  it('always includes the core groups', () => {
    const ids = getSearchGroups().map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(['web', 'chat', 'x', 'extreme', 'memory']));
  });
});

describe('cn', () => {
  it('merges conflicting tailwind classes keeping the last', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});
