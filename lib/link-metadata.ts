import 'server-only';

import { kvGet, kvSet } from '@/lib/redis';
import { createLogger } from '@/lib/logger';
import { fetchPublicUrl } from '@/lib/net/public-url';
import { METADATA_TIMEOUT_MS } from '@/lib/timeouts';

const log = createLogger('link-metadata');

// A link's title, description, image and favicon, read by Zetora itself from
// the page's <head>: for citation previews, the sources list, and as the last
// resort when no content provider could read a page.
export interface LinkMetadata {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  canonical?: string;
  ogUrl?: string;
  siteName?: string;
  image?: string;
  favicon?: string;
}

const MAX_REDIRECTS = 3;
// Head tags sit at the top of the page: no need to read the whole document.
const MAX_HTML_BYTES = 256 * 1024;
const CACHE_TTL_S = 24 * 60 * 60;
const MISS_CACHE_TTL_S = 60 * 60;
const USER_AGENT = 'Mozilla/5.0 (compatible; ZetoraBot/1.0; +link preview)';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(value: string | undefined, maxLength: number): string | undefined {
  const text = value ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '';
  return text ? text.slice(0, maxLength) : undefined;
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function resolveUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(decodeEntities(value.trim()), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseLinkMetadata(html: string, url: string, finalUrl: URL): LinkMetadata {
  const meta: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(tag);
    const key = (attributes.property ?? attributes.name)?.toLowerCase();
    if (key && attributes.content !== undefined && !(key in meta)) meta[key] = attributes.content;
  }

  let canonical: string | undefined;
  let favicon: string | undefined;
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(tag);
    const rel = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
    if (!canonical && rel.includes('canonical')) canonical = resolveUrl(attributes.href, finalUrl);
    if (!favicon && rel.includes('icon')) favicon = resolveUrl(attributes.href, finalUrl);
  }

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return {
    url,
    finalUrl: finalUrl.toString(),
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? title, 300),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 1000),
    canonical,
    ogUrl: resolveUrl(meta['og:url'], finalUrl),
    siteName: clean(meta['og:site_name'], 200),
    image: resolveUrl(meta['og:image'] ?? meta['twitter:image'], finalUrl),
    favicon: favicon ?? new URL('/favicon.ico', finalUrl).toString(),
  };
}

async function readHead(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let bytes = 0;
  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  await reader.cancel().catch(() => undefined);
  return html;
}

async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  const { response, url: finalUrl } = await fetchPublicUrl(url, {
    timeoutMs: METADATA_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('html')) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  return parseLinkMetadata(await readHead(response), url, finalUrl);
}

// Null when the page can't be read (not public, not HTML, unreachable).
// Both outcomes are cached, so a link is fetched at most once a day.
export async function getLinkMetadata(url: string): Promise<LinkMetadata | null> {
  const cacheKey = `link-metadata:${url}`;
  const cached = await kvGet<LinkMetadata | { miss: true }>(cacheKey);
  if (cached) return 'miss' in cached ? null : cached;

  let metadata: LinkMetadata | null = null;
  try {
    metadata = await fetchLinkMetadata(url);
  } catch (error) {
    log.debug(`Could not read metadata for ${url}:`, error);
  }
  await kvSet(cacheKey, metadata ?? { miss: true }, { ex: metadata ? CACHE_TTL_S : MISS_CACHE_TTL_S });
  return metadata;
}
