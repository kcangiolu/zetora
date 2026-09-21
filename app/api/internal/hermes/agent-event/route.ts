import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import {
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getMessageById,
  updateMessagePartsById,
  updateMessageHermesReaction,
  saveMessages,
} from '@/lib/db/queries';
import { publishHermesEvent, isHermesChatViewerActive } from '@/lib/hermes/realtime';
import { sendPushToUser } from '@/lib/push/send-push';
import { getStorageClient } from '@/lib/storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-agent-event');

const { client: storageClient, bucketName: STORAGE_BUCKET_NAME, publicUrl: STORAGE_PUBLIC_URL } = getStorageClient();

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const RELAY_MEDIA_ID_PATTERN = /\/relay\/media\/([^/?#]+)$/;

function sanitizeExtension(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 10);
  return cleaned || 'bin';
}

// A send_media action's source_url is either (a) our own relay-media reference — the id
// IS the base64url of the real storage URL app/api/internal/hermes/media/route.ts already
// wrote to, so resolving it needs no re-fetch or lookup table — or (b) a public http(s)
// URL (e.g. a fal.media generation) we download and re-host ourselves, so the DB/UI never
// cites a third-party URL directly (mirrors the contract's symmetric inbound-media
// re-host treatment of expiring platform URLs).
async function resolveMediaUrl(sourceUrl: string, ownerUserId: string): Promise<string | null> {
  const relayMatch = sourceUrl.match(RELAY_MEDIA_ID_PATTERN);
  if (relayMatch) {
    try {
      return Buffer.from(relayMatch[1], 'base64url').toString('utf8');
    } catch {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  let res: Response;
  try {
    res = await fetch(sourceUrl);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_MEDIA_BYTES) return null;

  const ext = sanitizeExtension(parsed.pathname.split('.').pop());
  const key = `zetora/hermes-media/${ownerUserId}/${nanoid()}.${ext}`;
  await storageClient.send(
    new PutObjectCommand({ Bucket: STORAGE_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }),
  );
  return `${STORAGE_PUBLIC_URL}/${key}`;
}

interface OutboundAction {
  op?: string;
  chat_id?: string;
  content?: string;
  reply_to?: string | null;
  metadata?: Record<string, unknown>;
  prompt_kind?: string;
  prompt_id?: string;
  options?: Array<{ id: string; label: string; style?: string }>;
  message_id?: string;
  emoji?: string;
  remove?: boolean;
  media_kind?: string;
  source_url?: string;
  filename?: string;
}

type MessagePart = { type: string; [key: string]: unknown };

// Called by hermes-relay-service when the gateway sends an `outbound` frame (the agent's
// send/edit/typing/prompt/react/send_media actions — verified against
// gateway/relay/adapter.py's RelayAdapter directly, not the prose doc: `send` at
// RelayAdapter.send, `edit` at .edit_message, `typing` at .send_typing, `prompt` at
// ._send_prompt, `react` at ._react, `send_media` at .send_media). `follow_up`/threads
// are each a bigger, separately-scoped feature (proactive session_key routing) — not
// handled here.
export async function POST(req: NextRequest) {
  const authError = assertInternalHermesAuth(req);
  if (authError) return authError;

  let body: { gatewayId?: string; action?: OutboundAction };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const { gatewayId, action } = body;
  if (!gatewayId || !action?.op) {
    return NextResponse.json({ success: false, error: 'missing_fields' }, { status: 400 });
  }

  try {
    const connector = await getHermesConnectorByGatewayId(gatewayId);
    if (!connector) {
      return NextResponse.json({ success: false, error: 'unknown_gateway' });
    }

    // Resolved by action.chat_id, NOT by connectorId alone: a connector can own many
    // hermesConversation rows (one per Zetora chat that ever used Agent mode — see
    // /api/hermes/send/route.ts's createHermesConversation), so a connector-wide lookup
    // picks an ARBITRARY one and silently misroutes every reply to whichever chat that
    // happened to be, regardless of which chat this action is actually about. chat_id is
    // present on every outbound op per the contract table, and echoes back verbatim the
    // Zetora chatId this route itself sent as SessionSource.chat_id in /api/hermes/send.
    if (!action.chat_id) {
      return NextResponse.json({ success: false, error: 'missing_chat_id' });
    }
    const conversation = await getHermesConversationByChatId(action.chat_id);
    if (!conversation || conversation.connectorId !== connector.id) {
      return NextResponse.json({ success: false, error: 'no_conversation' });
    }

    if (action.op === 'typing') {
      // Best-effort, ephemeral, never persisted — a heartbeat that repeats roughly every
      // 2s for the life of a turn (adapter.py's _keep_typing loop). `content` carries the
      // agent's current status phrase ("Finding answers…") when it has one.
      await publishHermesEvent(conversation.chatId, { kind: 'typing', content: action.content ?? null });
      return NextResponse.json({ success: true });
    }

    if (action.op === 'edit') {
      if (!action.message_id || !action.content) {
        return NextResponse.json({ success: false, error: 'missing_content' });
      }
      const [existing] = await getMessageById({ id: action.message_id });
      // message_id here is exactly the id this route itself minted and returned in the
      // `send` result that started this message — see the `send` branch below — so a
      // direct id lookup is the correlation, no separate link table needed.
      if (!existing || existing.chatId !== conversation.chatId) {
        return NextResponse.json({ success: false, error: 'unknown_message' });
      }
      const parts: MessagePart[] = [{ type: 'text', text: action.content }];
      await updateMessagePartsById({ id: action.message_id, parts });
      await publishHermesEvent(conversation.chatId, { kind: 'edit', message: { id: action.message_id, parts } });
      return NextResponse.json({ success: true });
    }

    if (action.op === 'react') {
      // Targets a USER message (adapter.py's on_processing_start/on_processing_complete
      // react on event.message_id / event.source.message_id — the id of the INBOUND
      // message this route itself assigned in /api/hermes/send, echoed back here), never
      // one of Hermes's own replies. Best-effort by contract: never surface a failure as
      // anything but success:false, and a missing message is a normal race (deleted,
      // wrong id) rather than an error worth 500ing over.
      if (!action.message_id) {
        return NextResponse.json({ success: false, error: 'missing_message_id' });
      }
      const [existing] = await getMessageById({ id: action.message_id });
      if (!existing || existing.chatId !== conversation.chatId) {
        return NextResponse.json({ success: false, error: 'unknown_message' });
      }
      const emoji = action.remove ? null : (action.emoji ?? null);
      await updateMessageHermesReaction({ id: action.message_id, emoji });
      await publishHermesEvent(conversation.chatId, {
        kind: 'reaction',
        message: { id: action.message_id, emoji },
      });
      return NextResponse.json({ success: true });
    }

    let parts: MessagePart[];
    if (action.op === 'send') {
      if (!action.content) {
        return NextResponse.json({ success: false, error: 'missing_content' });
      }
      parts = [{ type: 'text', text: action.content }];
    } else if (action.op === 'prompt') {
      if (!action.content || !action.prompt_id || !Array.isArray(action.options)) {
        return NextResponse.json({ success: false, error: 'missing_content' });
      }
      parts = [
        { type: 'text', text: action.content },
        {
          type: 'data-hermes_prompt',
          data: {
            promptId: action.prompt_id,
            promptKind: action.prompt_kind ?? 'choice',
            content: action.content,
            options: action.options,
          },
        },
      ];
    } else if (action.op === 'send_media') {
      if (!action.media_kind || !action.source_url) {
        return NextResponse.json({ success: false, error: 'missing_content' });
      }
      const mediaUrl = await resolveMediaUrl(action.source_url, connector.userId);
      if (!mediaUrl) {
        return NextResponse.json({ success: false, error: 'media_fetch_failed' });
      }
      parts = [
        {
          type: 'data-hermes_media',
          data: {
            mediaKind: action.media_kind,
            url: mediaUrl,
            filename: action.filename ?? null,
            // adapter.py's _send_media always sends `content: caption or ""` — never
            // omitted — so an empty string means "no caption", not a legitimate value.
            caption: action.content || null,
          },
        },
      ];
    } else {
      return NextResponse.json({ success: false, error: 'op_not_supported' });
    }

    const messageId = crypto.randomUUID();
    const createdAt = new Date();

    await saveMessages({
      messages: [
        {
          id: messageId,
          chatId: conversation.chatId,
          role: 'assistant',
          parts,
          attachments: [],
          createdAt,
          model: null,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          completionTime: null,
          searchVector: null,
          isCompactionSummary: false,
          compactionReplacedCount: null,
          hermesReaction: null,
        },
      ],
    });

    await publishHermesEvent(conversation.chatId, {
      kind: 'message',
      message: { id: messageId, role: 'assistant', parts, createdAt },
    });

    // Only push when no tab has this chat's SSE stream open — that's the whole signal
    // (see lib/hermes/realtime.ts's markHermesChatViewerActive), not a user preference
    // check: the preference is whether a subscription exists at all (Settings > Hermes).
    const hasActiveViewer = await isHermesChatViewerActive(conversation.chatId);
    if (!hasActiveViewer) {
      const content = action.content || (action.op === 'send_media' ? `📎 ${action.media_kind}` : '');
      const body = content.length > 160 ? `${content.slice(0, 157)}...` : content;
      await sendPushToUser(connector.userId, {
        title: 'Hermes',
        body,
        url: `/search/${conversation.chatId}`,
      });
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    log.error('Failed to process Hermes agent event:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
