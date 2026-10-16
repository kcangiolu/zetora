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

// The hostname without its leading "www.", for display.
export function getDisplayHostname(url: string | null | undefined): string {
  return safeHostname(url).replace(/^www\./, '');
}

type FaviconSize = 16 | 32 | 64 | 128;

// A host's favicon, from Google's favicon service.
export function getHostFaviconUrl(hostname: string, size: FaviconSize = 128): string {
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(hostname)}`;
}

// The favicon of the site a URL points to.
export function getFaviconUrl(url: string | null | undefined, size: FaviconSize = 128): string {
  const hostname = safeHostname(url);
  return hostname ? getHostFaviconUrl(hostname, size) : '';
}
