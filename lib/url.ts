// URLs from search results and model output are not always valid, so none
// of these throw: an unparseable URL gives an empty string.

function safeHostname(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// The site's favicon, from Google's favicon service.
export function getFaviconUrl(url: string | null | undefined): string {
  const hostname = safeHostname(url);
  return hostname ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(hostname)}` : '';
}
