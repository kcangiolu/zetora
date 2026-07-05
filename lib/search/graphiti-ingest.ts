import 'server-only';

import { graphitiClient, createGraphitiClient } from '@/lib/graphiti/client';
import type { ChatMessage } from '@/lib/types';

// In-memory dedup so a resumed/replayed stream doesn't re-ingest the same
// messages within this server process.
const ingestedMessageIds = new Set<string>();

function extractText(parts: unknown[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => {
      const part = p as { type?: unknown; text?: unknown };
      return part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0;
    })
    .map((p) => p.text.trim())
    .join(' ');
}

function cleanEpisodeBody(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^---$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    let cutPoint = remaining.lastIndexOf('\n', maxChars);
    if (cutPoint === -1 || cutPoint < maxChars / 2) {
      cutPoint = remaining.lastIndexOf(' ', maxChars);
    }
    if (cutPoint === -1 || cutPoint < maxChars / 2) {
      cutPoint = maxChars;
    }

    chunks.push(remaining.slice(0, cutPoint).trim());
    remaining = remaining.slice(cutPoint).trim();
  }

  return chunks.filter((c) => c.length > 0);
}

async function ingestWithRetry(
  client: ReturnType<typeof createGraphitiClient>,
  episode: { name: string; episodeBody: string; referenceTime: string; sourceDescription: string; groupId: string },
  maxRetries: number,
  chunkIndex: number,
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client.addEpisode(episode);
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMsg = error instanceof Error ? error.message : String(error);

      const isRetryable =
        errorMsg.includes('empty response') || errorMsg.includes('Expecting value') || errorMsg.includes('char 0');

      if (isRetryable && !isLastAttempt) {
        console.warn(
          `[Graphiti] Chunk ${chunkIndex} attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${500 * (attempt + 1)}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }

      throw error;
    }
  }
}

/**
 * Fire-and-forget ingestion of a finished chat turn into the Graphiti
 * knowledge graph. No-op unless the user's memory provider is 'graphiti'.
 * Extracted from the search route's onFinish; never blocks the response.
 */
export function ingestChatIntoGraphiti({
  messages,
  episodeTitle,
  groupId,
  preferences,
}: {
  messages: ChatMessage[];
  episodeTitle: string;
  groupId: string;
  preferences: Record<string, unknown> | null | undefined;
}): void {
  const memoryProvider = preferences?.['zetora-memory-provider'] || 'supermemory';
  if (memoryProvider !== 'graphiti') return;

  const graphitiApiUrl = preferences?.['zetora-graphiti-api-url'] as string | undefined;
  const client = graphitiApiUrl ? createGraphitiClient(graphitiApiUrl) : graphitiClient;

  const chunkSizePref = preferences?.['zetora-graphiti-chunk-size'];
  const chunkSize = typeof chunkSizePref === 'number' && chunkSizePref > 0 ? chunkSizePref : 8000;

  const maxRetriesPref = preferences?.['zetora-graphiti-max-retries'];
  const maxRetries = typeof maxRetriesPref === 'number' && maxRetriesPref >= 0 ? maxRetriesPref : 2;

  const newMessageIds = messages.map((m) => m.id);
  const allAlreadyIngested = newMessageIds.every((mid) => ingestedMessageIds.has(mid));

  if (allAlreadyIngested) {
    console.log('[Graphiti] All messages already ingested, skipping');
    return;
  }

  newMessageIds.forEach((mid) => ingestedMessageIds.add(mid));

  // Periodic cleanup: clear the Set every 10000 IDs
  if (ingestedMessageIds.size > 10000) {
    const entries = [...ingestedMessageIds];
    ingestedMessageIds.clear();
    entries.slice(-5000).forEach((mid) => ingestedMessageIds.add(mid));
  }

  const rawBody = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const text = Array.isArray(m.parts) ? extractText(m.parts) : '';
      return text ? `${m.role}: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const episodeBody = cleanEpisodeBody(rawBody);
  if (!episodeBody) return;

  const chunks = splitIntoChunks(episodeBody, chunkSize);

  // Send sequentially to avoid overloading Graphiti's LLM
  (async () => {
    for (let index = 0; index < chunks.length; index++) {
      if (index > 0) {
        // 2s pause between chunks to let the LLM breathe
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      try {
        await ingestWithRetry(
          client,
          {
            name: `${episodeTitle}-part${index + 1}`,
            episodeBody: chunks[index],
            referenceTime: new Date().toISOString(),
            sourceDescription: 'Zetora conversation',
            groupId,
          },
          maxRetries,
          index,
        );
      } catch (err) {
        console.error(
          `[Graphiti] Chunk ${index} ingestion failed after ${maxRetries} retries:`,
          err instanceof Error ? err.message : err,
        );
        // Continue with the remaining chunks
      }
    }
  })().catch((err) => console.error('[Graphiti] Batch ingestion failed:', err instanceof Error ? err.message : err));
}
