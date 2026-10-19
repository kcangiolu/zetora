import { tool } from 'ai';
import { all } from 'better-all';
import { z } from 'zod';

import { getBetterAllOptions } from '@/lib/better-all';
import { createLogger } from '@/lib/logger';
import { BROWSE_PAGE_CONTENT_MAX_CHARS } from '@/lib/tools/self-hosted-content';
import { getHostFaviconUrl } from '@/lib/url';

import { getHostnameForUrl, runExtremeContentExtraction, type ExtremeProviderStack } from '../providers';
import type { AgentToolContext } from './context';

const log = createLogger('extreme-search');

export function createBrowsePageTool({ emit, collectSources }: AgentToolContext, stack: ExtremeProviderStack) {
  const { contentProvider, contentFallbackProvider, metadataEnabled, clients } = stack;

  return tool({
    description:
      'Browse 1-5 specific URLs using rendered page scraping. Use when pages are JavaScript-heavy, need full-page content, or when search snippets are not enough.',
    inputSchema: z.object({
      urls: z
        .array(z.string().describe('URL to browse'))
        .min(1)
        .max(5)
        .describe('Array of 1-5 URLs to scrape for full rendered content'),
      reason: z.string().optional().describe('Brief reason for reading the page in full'),
    }),
    execute: async ({ urls, reason }, { toolCallId: browseId, abortSignal }) => {
      log.info('[BrowsePage] Browsing URLs:', urls, 'Reason:', reason);
      const total = urls.length;
      emit({ kind: 'browse_page', browseId, urls, index: 0, total, status: 'started' });

      const browseTasks = Object.fromEntries(
        urls.map((url, index) => [
          `browse-${index}`,
          async () => {
            try {
              emit({ kind: 'browse_page', browseId, urls, index, total, status: 'browsing' });

              const hostname = getHostnameForUrl(url);
              const favicon = getHostFaviconUrl(hostname);

              // The same content providers as webSearch's content step, with a larger character cap.
              const [browseResult] = await runExtremeContentExtraction(
                [url],
                contentProvider,
                contentFallbackProvider,
                metadataEnabled,
                clients,
                { maxContentChars: BROWSE_PAGE_CONTENT_MAX_CHARS, abortSignal },
              );

              const title = browseResult?.title || hostname;
              const content = browseResult?.content || '';
              if (content) log.info(`[BrowsePage][${url}] resolved via ${contentProvider}, length: ${content.length}`);

              collectSources({ title, url, content, publishedDate: '', favicon, fullContent: true });
              return { url, title, content, favicon };
            } catch (error) {
              log.error(`[BrowsePage] Error browsing ${url}:`, error);
              return { url, title: url, content: '', error: String(error) };
            }
          },
        ]),
      );

      const browseResultsMap = await all(browseTasks, getBetterAllOptions());
      const results = urls.map((_, index) => browseResultsMap[`browse-${index}`]).filter(Boolean);

      emit({ kind: 'browse_page', browseId, urls, index: total - 1, total, status: 'completed', results });
      return { urls, results };
    },
  });
}
