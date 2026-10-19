import { describe, it, expect } from 'vitest';

import { DEFAULT_LOCALE, getLocaleFromAcceptLanguage } from '@/lib/locale';

describe('getLocaleFromAcceptLanguage', () => {
  it('picks the first language of a browser header', () => {
    expect(getLocaleFromAcceptLanguage('fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('fr-FR');
  });

  it('ranks by quality, not by position', () => {
    expect(getLocaleFromAcceptLanguage('en;q=0.5, de-CH')).toBe('de-CH');
  });

  it('skips wildcards, refused and malformed tags', () => {
    expect(getLocaleFromAcceptLanguage('*, fr;q=0, not a tag, es-MX;q=0.4')).toBe('es-MX');
  });

  it('uses the default locale when the request names none', () => {
    expect(getLocaleFromAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
    expect(getLocaleFromAcceptLanguage('*')).toBe(DEFAULT_LOCALE);
  });
});
