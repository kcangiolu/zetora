import 'server-only';

import { after } from 'next/server';
import {
  getChatByIdForValidation,
  getHermesChatLock,
  getHermesConnectorByUserId,
  getHermesConversationByChatId,
  createHermesConversation,
  saveChat,
  saveMessages,
  updateChatTitleById,
} from '@/lib/db/queries';
import { deliverToGateway } from '@/lib/hermes/relay-client';
import { publishHermesEvent } from '@/lib/hermes/realtime';
import { generateTitleFromUserMessage, UNTITLED_CHAT_TITLE } from '@/lib/search/chat-title';
import { hermesMessageTypeFor, type HermesMediaRef } from '@/lib/hermes/attachments';
import { createLogger } from '@/lib/logger';

const log = createLogger('hermes-send');

// Hermes shows a chat's topic in the session context of its prompt, as metadata it must not
// take orders from. Zetora's Hermes plugin (hermes-plugin/zetora) matches this exact text to
// tell a spoken message apart and ask for a speakable reply: change both together.
const VOICE_CHAT_TOPIC =
  'Voice conversation: the user speaks through speech-to-text and hears every reply read aloud by text-to-speech.';

export interface HermesPromptResponse {
  promptId: string;
  optionId: string;
  label?: string;
}

export type HermesSendResult = { ok: true; messageId: string } | { ok: false; status: number; error: string };

// A user's message (or a HermesPromptCard button click) to their own Hermes agent, shared
// by the chat (app/api/hermes/send) and the voice page (app/api/voice/hermes). The caller
// has authenticated the user and vetted the attachments.
export async function sendToHermes({
  user,
  chatId,
  messageId: requestedMessageId,
  text,
  media = [],
  promptResponse,
  voice = false,
}: {
  user: { id: string; name: string };
  chatId: string;
  // The id the browser already shows the message under, when it has one.
  messageId?: string;
  text: string;
  media?: HermesMediaRef[];
  promptResponse?: HermesPromptResponse;
  // Spoken on the voice page: Hermes answers a voice turn on its `auxiliary.voice_chat`
  // route (by default the session's model with reasoning off), and the chat topic says the
  // reply will be heard. The text is already transcribed, so there is no audio.
  voice?: boolean;
}): Promise<HermesSendResult> {
  // Unlike /api/search, this is the ONLY thing that ever creates a chat row for a Hermes
  // conversation — there's no separate LLM-turn machinery in front of it to do so for a
  // brand-new chat, so the first message of a new Hermes chat must create it here.
  const existingChat = await getChatByIdForValidation({ id: chatId });
  if (existingChat && existingChat.userId !== user.id) {
    return { ok: false, status: 404, error: 'Chat not found' };
  }
  // A chat whose first message ever sent went through a native Zetora search turn is
  // permanently a search conversation — Agent mode can't retroactively claim it (see
  // getHermesChatLock's own comment for the full rule).
  if (existingChat && (await getHermesChatLock(chatId)) === 'search') {
    return { ok: false, status: 409, error: 'This conversation is locked to Zetora search mode' };
  }
  if (!existingChat) {
    // Provisional until the generated title lands (see the `after` below), so the sidebar
    // never shows a blank row. An attachment-only first message has no text to name the
    // chat after — fall back to the file's own name, which then stays: the title
    // generator only reads text.
    const titleSource = text || media[0]?.name || 'Attachment';
    await saveChat({
      id: chatId,
      userId: user.id,
      title: titleSource.length > 80 ? `${titleSource.slice(0, 77)}...` : titleSource,
      visibility: 'private',
    });
  }

  const connector = await getHermesConnectorByUserId(user.id);
  if (!connector || connector.status !== 'enrolled' || !connector.gatewayId) {
    return { ok: false, status: 409, error: 'No Hermes connector enrolled' };
  }

  let conversation = await getHermesConversationByChatId(chatId);
  if (!conversation) {
    conversation = await createHermesConversation({ chatId, connectorId: connector.id });
  }

  const messageId = requestedMessageId ?? crypto.randomUUID();
  // Files first, then the text — the same order /api/search's client builds, so the
  // existing user-message rendering (components/message.tsx's `file` part filter) shows
  // these exactly like an attachment on a normal turn, with nothing Hermes-specific.
  const parts = [
    ...media.map((m) => ({ type: 'file' as const, url: m.url, name: m.name ?? '', mediaType: m.mime })),
    { type: 'text' as const, text },
  ];
  try {
    await saveMessages({
      messages: [
        {
          id: messageId,
          chatId,
          role: 'user',
          parts,
          attachments: [],
          createdAt: new Date(),
          model: null,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          completionTime: null,
          searchVector: null,
          isCompactionSummary: false,
          compactionReplacedCount: null,
          hermesReaction: null,
          hermesGatewayId: null,
        },
      ],
    });
  } catch (error) {
    log.error('Failed to persist Hermes user message:', error);
    return { ok: false, status: 500, error: 'Failed to save message' };
  }

  // Wire shape of gateway/relay/ws_transport.py's _event_from_wire (see
  // hermes-relay-service/README.md).
  const event: Record<string, unknown> = {
    text,
    message_type: voice ? 'voice' : hermesMessageTypeFor(media.map((m) => m.mime)),
    message_id: messageId,
    source: {
      platform: 'zetora',
      chat_id: chatId,
      chat_type: 'dm',
      ...(voice ? { chat_topic: VOICE_CHAT_TOPIC } : {}),
      user_id: user.id,
      user_name: user.name,
    },
  };
  if (media.length > 0) {
    // Both fields, always. _media_types_from_wire treats media_urls (flat) and
    // media (rich) as INDEPENDENT wire fields and pairs them BY URL, so sending only one
    // costs every attachment its MIME — and the MIME is what routes an image to vision and
    // a PDF to the file tools. The gateway then downloads each URL to a local temp path
    // before the agent ever sees it (adapter.py's _localize_inbound_media).
    event.media_urls = media.map((m) => m.url);
    event.media = media.map((m) => ({ url: m.url, mime: m.mime, ...(m.name ? { name: m.name } : {}) }));
  }
  if (promptResponse) {
    event.prompt_response = {
      prompt_id: promptResponse.promptId,
      option_id: promptResponse.optionId,
      label: promptResponse.label,
    };
  }

  // A new chat gets the same generated title a classic chat does, off the response path:
  // the user's message is already saved and delivering it to the agent must not wait on a
  // model call. The client hears about it on the chat's Hermes SSE stream, as it would on
  // a classic turn's own stream (app/api/search/route.ts's `data-chat_title`).
  if (!existingChat && text) {
    after(async () => {
      try {
        const title = await generateTitleFromUserMessage({
          message: { id: messageId, role: 'user', parts: [{ type: 'text', text }] },
          userId: user.id,
        });
        // Generation disabled in the user's preferences (or an empty output): the
        // provisional title is still a better name than "New Chat".
        if (title === UNTITLED_CHAT_TITLE) return;
        await updateChatTitleById({ chatId, title });
        await publishHermesEvent(chatId, { kind: 'title', title });
      } catch (error) {
        log.error('Failed to generate Hermes chat title:', error);
      }
    });
  }

  const result = await deliverToGateway({ gatewayId: connector.gatewayId, event });
  if (!result.success) {
    return { ok: false, status: 502, error: result.error ?? 'gateway_offline' };
  }
  return { ok: true, messageId };
}
