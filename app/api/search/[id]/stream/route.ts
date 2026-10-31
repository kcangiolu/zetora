import { auth } from '@/lib/auth';
import { getChatById, getMessagesByChatId, getStreamIdsByChatId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import { createUIMessageStream, JsonToSseTransformStream } from 'ai';
import { createResumableUIMessageStream } from 'ai-resumable-stream';
import { getResumableStreamClients } from '@/lib/redis';
import { withSseKeepAlive } from '@/lib/search/sse-keep-alive';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

import { createLogger } from '@/lib/logger';

const log = createLogger('search-stream');

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: chatId } = await params;

  const clients = getResumableStreamClients();

  if (!clients) {
    return new Response(null, { status: 204 });
  }

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  // Parallelize session, chat, and streamIds fetch (eliminate waterfall)
  const { session, chat, streamIds } = await all(
    {
      async session() {
        return auth.api.getSession({ headers: req.headers });
      },
      async chat() {
        return getChatById({ id: chatId }).catch(() => null);
      },
      async streamIds() {
        return getStreamIdsByChatId({ chatId });
      },
    },
    getBetterAllOptions(),
  );

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const context = await createResumableUIMessageStream({
    streamId: recentStreamId,
    publisher: clients.publisher,
    subscriber: clients.subscriber,
  });

  const stream = await context.resumeStream();

  const emptyDataStream = createUIMessageStream<ChatMessage>({
    execute: () => {},
  });

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId, mostRecent: true });
    log.debug('Messages: ', messages);
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      log.debug('No most recent message found');
      return new Response(emptyDataStream.pipeThrough(new JsonToSseTransformStream()), { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      log.debug('Most recent message is not an assistant message');
      return new Response(emptyDataStream.pipeThrough(new JsonToSseTransformStream()), { status: 200 });
    }

    const restoredStream = createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        log.debug('Restoring stream...');
        log.debug('Most recent message: ', mostRecentMessage);
        writer.write({
          type: 'data-appendMessage',
          data: JSON.stringify(mostRecentMessage),
          transient: true,
        });
      },
    });

    return new Response(restoredStream.pipeThrough(new JsonToSseTransformStream()), { status: 200 });
  }

  return new Response(withSseKeepAlive((stream as ReadableStream<any>).pipeThrough(new JsonToSseTransformStream())), {
    status: 200,
  });
}
