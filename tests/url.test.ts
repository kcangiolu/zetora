import { describe, it, expect } from 'vitest';

import { getDisplayHostname, getFaviconUrl, getHostFaviconUrl } from '@/lib/url';

describe('getDisplayHostname', () => {
  it('drops only a leading www', () => {
    expect(getDisplayHostname('https://www.example.com/a')).toBe('example.com');
    expect(getDisplayHostname('https://docs.www.example.com')).toBe('docs.www.example.com');
  });

  it('returns an empty string for missing or invalid URLs', () => {
    expect(getDisplayHostname(undefined)).toBe('');
    expect(getDisplayHostname('not a url')).toBe('');
  });
});

describe('getFaviconUrl', () => {
  it('builds the favicon URL of the host at the requested size', () => {
    expect(getFaviconUrl('https://example.com/page', 64)).toBe(
      'https://www.google.com/s2/favicons?sz=64&domain=example.com',
    );
    expect(getHostFaviconUrl('example.com')).toBe('https://www.google.com/s2/favicons?sz=128&domain=example.com');
  });

  it('returns an empty string for invalid URLs', () => {
    expect(getFaviconUrl('not a url')).toBe('');
  });
});
