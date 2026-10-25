import { DefaultChatTransport, type HttpChatTransportInitOptions } from 'ai';
import type { ChatMessage } from '@/lib/types';

// Delays before each automatic re-attach after a dropped stream. The first
// request after iOS wakes a PWA often fails while the network comes back, so
// one immediate attempt is not enough; past the last delay the error stays
// on screen until the page returns to the foreground or goes back online.
export const RESUME_RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const;

/**
 * A connection that dropped (iOS: "Load failed", Chrome: "network error")
 * surfaces from fetch or from reading the body as a TypeError. A failure the
 * server reported, whether an error chunk in the stream or an error response
 * to the resume request, arrives as a plain Error carrying its message, and
 * re-attaching would only replay it.
 */
export function isConnectionLoss(error: Error | undefined): boolean {
  return error instanceof TypeError;
}

/**
 * True when the turn already reached the server and started answering: the
 * reply's first chunk adds the assistant message. A request that failed
 * before that may never have reached the server, and re-attaching would land
 * on the previous turn's stream and hide the failure.
 */
export function hasUnfinishedReply(messages: ChatMessage[]): boolean {
  return messages.at(-1)?.role === 'assistant';
}

/**
 * The resume route replays the latest turn from its first chunk, or sends the
 * whole saved message once it has finished. Either way the partial reply
 * already on screen must go first, or the replayed text is appended after it.
 */
export function withoutUnfinishedReply(messages: ChatMessage[]): ChatMessage[] {
  return hasUnfinishedReply(messages) ? messages.slice(0, -1) : messages;
}

type ResumableChatTransportOptions = HttpChatTransportInitOptions<ChatMessage> & {
  // Called once a resume request got a stream back, before the chat reads its
  // last message to decide which message the stream continues.
  onReconnected: () => void;
};

export class ResumableChatTransport extends DefaultChatTransport<ChatMessage> {
  private readonly onReconnected: () => void;

  constructor({ onReconnected, ...options }: ResumableChatTransportOptions) {
    super(options);
    this.onReconnected = onReconnected;
  }

  override async reconnectToStream(
    options: Parameters<DefaultChatTransport<ChatMessage>['reconnectToStream']>[0],
  ): ReturnType<DefaultChatTransport<ChatMessage>['reconnectToStream']> {
    const stream = await super.reconnectToStream(options);
    if (stream) this.onReconnected();
    return stream;
  }
}
