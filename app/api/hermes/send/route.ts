import { after, NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
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
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import {
  hermesMessageTypeFor,
  resolveHermesAttachments,
  type HermesAttachmentRef,
} from '@/lib/hermes/attachments';
import { getStorageClient } from '@/lib/storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-hermes-send');


interface SendBody {
  chatId?: string;
  text?: string;
  promptResponse?: { promptId: string; optionId: string; label?: string };
  attachments?: HermesAttachmentRef[];
}

// Outbound path: a user's message (or a HermesPromptCard button click) to their own
// Hermes agent. Its own route rather than app/api/search, whose model and tool
// machinery a Hermes turn never uses: it only talks to hermes-relay-service.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { chatId, promptResponse } = body;
  const text = typeof body.text === 'string' ? body.text : '';
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  // A caption-less attachment is a normal message on every other platform Hermes fronts,
  // so text is only required when nothing else carries the message.
  if (!chatId || typeof chatId !== 'string' || (!text && attachments.length === 0)) {
    return NextResponse.json({ error: 'chatId and either text or an attachment are required' }, { status: 400 });
  }

  const session = await auth.api.getSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Before anything is written or delivered: the gateway downloads every URL cited in
  // media_urls, so an attachment that isn't this user's own upload is refused outright
  // rather than quietly skipped (see resolveHermesAttachments).
  const { publicUrl: storagePublicUrl } = getStorageClient();
  const { media, rejected } = resolveHermesAttachments({
    attachments,
    userId: session.user.id,
    storagePublicUrl,
  });
  if (rejected.length > 0) {
    const detail = rejected.map((r) => `${r.name} (${r.reason})`).join(', ');
    return NextResponse.json({ error: `Attachment refused: ${detail}` }, { status: 400 });
  }

  // Unlike /api/search, this route is the ONLY thing that ever creates a chat row for a
  // Hermes conversation — there's no separate LLM-turn machinery in front of it to do so
  // for a brand-new chat, so the first message of a new Hermes chat must create it here.
  const existingChat = await getChatByIdForValidation({ id: chatId });
  if (existingChat && existingChat.userId !== session.user.id) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }
  // A chat whose first message ever sent went through a native Zetora search turn is
  // permanently a search conversation — Agent mode can't retroactively claim it (see
  // getHermesChatLock's own comment for the full rule).
  if (existingChat && (await getHermesChatLock(chatId)) === 'search') {
    return NextResponse.json({ error: 'This conversation is locked to Zetora search mode' }, { status: 409 });
  }
  if (!existingChat) {
    // Provisional until the generated title lands (see the `after` below), so the sidebar
    // never shows a blank row. An attachment-only first message has no text to name the
    // chat after — fall back to the file's own name, which then stays: the title
    // generator only reads text.
    const titleSource = text || media[0]?.name || 'Attachment';
    await saveChat({
      id: chatId,
      userId: session.user.id,
      title: titleSource.length > 80 ? `${titleSource.slice(0, 77)}...` : titleSource,
      visibility: 'private',
    });
  }

  const connector = await getHermesConnectorByUserId(session.user.id);
  if (!connector || connector.status !== 'enrolled' || !connector.gatewayId) {
    return NextResponse.json({ error: 'No Hermes connector enrolled' }, { status: 409 });
  }

  let conversation = await getHermesConversationByChatId(chatId);
  if (!conversation) {
    conversation = await createHermesConversation({ chatId, connectorId: connector.id });
  }

  const messageId = crypto.randomUUID();
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
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }

  // Wire shape of gateway/relay/ws_transport.py's _event_from_wire (see
  // hermes-relay-service/README.md).
  const event: Record<string, unknown> = {
    text,
    message_type: hermesMessageTypeFor(media.map((m) => m.mime)),
    message_id: messageId,
    source: {
      platform: 'zetora',
      chat_id: chatId,
      chat_type: 'dm',
      user_id: session.user.id,
      user_name: session.user.name,
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
          userId: session.user.id,
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
    return NextResponse.json({ success: false, error: result.error ?? 'gateway_offline' }, { status: 502 });
  }

  return NextResponse.json({ success: true, messageId });
}
