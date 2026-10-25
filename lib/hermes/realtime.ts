import 'server-only';

import { EventEmitter } from 'node:events';
import { getResumableStreamClients } from '@/lib/redis';
import { kvSet, kvExists } from '@/lib/redis';
import { createLogger } from '@/lib/logger';

const log = createLogger('hermes-realtime');

const CHANNEL_PREFIX = 'hermes:chat:';
const ACTIVE_VIEWER_PREFIX = 'hermes:active:';
const ACTIVE_VIEWER_TTL_S = 30;
// How often a live viewer renews its marker: well within ACTIVE_VIEWER_TTL_S.
export const ACTIVE_VIEWER_REFRESH_MS = 20_000;

// A pub/sub channel per Hermes chat, on the resumable-stream Redis clients but not on
// ai-resumable-stream itself: that library models one bounded LLM turn, while Hermes
// messages arrive asynchronously and indefinitely.
// One psubscribe covers every chat and fans out locally through an EventEmitter keyed by
// chatId, so each SSE request only adds a listener, independent of node-redis's
// per-channel listener semantics.
const localEvents = new EventEmitter();
localEvents.setMaxListeners(0);

let psubscribed = false;

async function ensureSubscribed(): Promise<boolean> {
  const clients = getResumableStreamClients();
  if (!clients) return false;
  if (psubscribed) return true;

  if (!clients.subscriber.isOpen) {
    await clients.subscriber.connect();
  }

  await clients.subscriber.pSubscribe(`${CHANNEL_PREFIX}*`, (message, channel) => {
    const chatId = channel.slice(CHANNEL_PREFIX.length);
    try {
      localEvents.emit(chatId, JSON.parse(message));
    } catch (error) {
      log.error('Failed to parse Hermes realtime message:', error);
    }
  });

  psubscribed = true;
  return true;
}

export async function publishHermesEvent(chatId: string, payload: unknown): Promise<void> {
  const clients = getResumableStreamClients();
  if (!clients) return;

  if (!clients.publisher.isOpen) {
    await clients.publisher.connect();
  }

  await clients.publisher.publish(`${CHANNEL_PREFIX}${chatId}`, JSON.stringify(payload));
}

// Registers `listener` for every event published on `chatId` and returns an unsubscribe
// function. Callers (the SSE route) must call it when the client disconnects.
export async function subscribeToHermesChat(chatId: string, listener: (payload: unknown) => void): Promise<() => void> {
  const subscribed = await ensureSubscribed();
  if (!subscribed) return () => {};

  localEvents.on(chatId, listener);
  return () => localEvents.off(chatId, listener);
}

// Marks `chatId` as having a live open tab, for ACTIVE_VIEWER_TTL_S seconds — the SSE
// route (app/api/hermes/[chatId]/stream/route.ts) refreshes this on an interval for as
// long as the connection stays open, so it decays naturally on disconnect rather than
// needing an explicit clear. This is what gates whether an inbound agent message also
// triggers a push notification (lib/push/send-push.ts) — no live viewer, no live tab to
// show it in.
export async function markHermesChatViewerActive(chatId: string): Promise<void> {
  await kvSet(`${ACTIVE_VIEWER_PREFIX}${chatId}`, 1, { ex: ACTIVE_VIEWER_TTL_S });
}

export async function isHermesChatViewerActive(chatId: string): Promise<boolean> {
  return kvExists(`${ACTIVE_VIEWER_PREFIX}${chatId}`);
}
