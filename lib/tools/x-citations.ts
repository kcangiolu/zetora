import { getTweet } from 'react-tweet/api';

import { createLogger } from '@/lib/logger';

const log = createLogger('x-citations');

const DEFAULT_WINDOW_DAYS = 15;

/** The part of an AI SDK source the X citations are read from. */
interface CitationSource {
  sourceType: string;
  url?: string;
}

export interface XPost {
  text: string;
  link: string;
  id: string;
  author: string;
  publishedDate: string;
  title: string;
}

export function sanitizeXHandles(handles: string[] | undefined): string[] | undefined {
  return handles?.map((handle) => handle.replace(/^@+/, '').trim()).filter(Boolean);
}

/** Fills a missing start or end date with the default window ending today. */
export function resolveXSearchDateRange(startDate?: string, endDate?: string): { start: string; end: string } {
  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  const windowStart = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    start: startDate?.trim() ? startDate : toYMD(windowStart),
    end: endDate?.trim() ? endDate : toYMD(new Date()),
  };
}

function extractTweetId(url: string): string | null {
  return url.match(/status\/(\d+)/)?.[1] ?? null;
}

/** Same post under x.com, twitter.com or a user path collapses to one key. */
function citationKey(url: string): string {
  return extractTweetId(url) ?? url;
}

/** Keeps the first citation per post; non-URL citations pass through. */
export function dedupeCitations<T extends CitationSource>(citations: readonly T[]): T[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (citation.sourceType !== 'url') return true;
    const key = citationKey(citation.url ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fetches the text and author of each cited post; posts that cannot be fetched are dropped. */
export async function hydrateXPosts(citations: readonly CitationSource[]): Promise<XPost[]> {
  const tweetIds = dedupeCitations(citations.filter((citation) => citation.sourceType === 'url'))
    .map((citation) => extractTweetId(citation.url ?? ''))
    .filter((id): id is string => id !== null);

  const posts = await Promise.all(
    tweetIds.map(async (id): Promise<XPost | null> => {
      try {
        const tweet = await getTweet(id);
        if (!tweet?.text) return null;
        const handle = tweet.user?.screen_name || 'unknown';
        return {
          text: tweet.text,
          link: `https://x.com/i/status/${id}`,
          id,
          author: `@${handle}`,
          publishedDate: tweet.created_at || '',
          title: `Post from @${handle}`,
        };
      } catch (error) {
        log.error(`Error fetching tweet data for ${id}:`, error);
        return null;
      }
    }),
  );

  return posts.filter((post): post is XPost => post !== null);
}
