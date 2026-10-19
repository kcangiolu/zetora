// Dates are formatted in the language the browser asks for. The server reads
// it from Accept-Language so its render matches the browser's.

// For requests that name no language (curl, crawlers).
export const DEFAULT_LOCALE = 'en-US';

// The highest-weighted language of an Accept-Language header that Intl can
// format, e.g. "fr-FR,fr;q=0.9,en;q=0.8" -> "fr-FR".
export function getLocaleFromAcceptLanguage(header: string | null): string {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(',')
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(';');
      const quality = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1]).find(Boolean);
      return { tag: tag.trim(), quality: quality === undefined ? 1 : Number(quality), index };
    })
    .filter(({ tag, quality }) => tag && tag !== '*' && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { tag } of ranked) {
    try {
      const [supported] = Intl.DateTimeFormat.supportedLocalesOf(tag);
      if (supported) return supported;
    } catch {
      // A malformed tag: try the next one.
    }
  }
  return DEFAULT_LOCALE;
}
