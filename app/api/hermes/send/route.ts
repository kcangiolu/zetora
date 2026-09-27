import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getChatByIdForValidation,
  getHermesChatLock,
  getHermesConnectorByUserId,
  getHermesConversationByChatId,
  createHermesConversation,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { deliverToGateway } from '@/lib/hermes/relay-client';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import {
  hermesMessageTypeFor,
  resolveHermesAttachments,
  type HermesAttachmentRef,
} from '@/lib/hermes/attachments';
import { getStorageClient } from '@/lib/storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-hermes-send');

const { publicUrl: STORAGE_PUBLIC_URL } = getStorageClient();

interface SendBody {
  chatId?: string;
  text?: string;
  promptResponse?: { promptId: string; optionId: string; label?: string };
  attachments?: HermesAttachmentRef[];
}

// Outbound path: a Zetora user's message (or a HermesPromptCard button click) to their
// own Hermes agent. Deliberately its own route, not app/api/search — that route is ~1380
// lines of streamText/tool/provider machinery a Hermes turn never touches (see the
// implementation plan's rationale). This route only ever talks to hermes-relay-service,
// never to an LLM.
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
  const { media, rejected } = resolveHermesAttachments({
    attachments,
    userId: session.user.id,
    storagePublicUrl: STORAGE_PUBLIC_URL,
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
    // An attachment-only first message has no text to name the chat after — fall back to
    // the file's own name rather than creating a blank-titled conversation.
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

  // Wire shape verified against gateway/relay/ws_transport.py's _event_from_wire, not
  // guessed from the prose doc — see hermes-relay-service/README.md.
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
    // Both fields, always. _media_types_from_wire treats media_urls (flat, legacy) and
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

  const result = await deliverToGateway({ gatewayId: connector.gatewayId, event });
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error ?? 'gateway_offline' }, { status: 502 });
  }

  return NextResponse.json({ success: true, messageId });
}
