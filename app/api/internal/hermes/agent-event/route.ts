import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import {
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getMessageById,
  updateMessagePartsById,
  updateMessageHermesReaction,
  saveMessages,
} from '@/lib/db/queries';
import { publishHermesEvent, isHermesChatViewerActive } from '@/lib/hermes/realtime';
import { isUnactionableHomeChannelNotice } from '@/lib/hermes/notices';
import { sendPushToUser } from '@/lib/push/send-push';
import { getStorageClient } from '@/lib/storage';
import { isInstanceStorageUrl } from '@/lib/net/attachment-fetch';
import { fetchPublicUrl, readBodyCapped } from '@/lib/net/public-url';
import { ATTACHMENT_TIMEOUT_MS } from '@/lib/timeouts';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-agent-event');

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const RELAY_MEDIA_ID_PATTERN = /\/relay\/media\/([^/?#]+)$/;
const MEDIA_REDIRECTS = 3;

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
  const { client: storageClient, bucketName: storageBucket, publicUrl: storagePublicUrl } = getStorageClient();

  const relayMatch = sourceUrl.match(RELAY_MEDIA_ID_PATTERN);
  if (relayMatch) {
    // Only an object the media route wrote for this owner: the id is opaque
    // to the gateway, but nothing stops it from encoding any URL.
    const decoded = Buffer.from(relayMatch[1], 'base64url').toString('utf8');
    if (!isInstanceStorageUrl(decoded, storagePublicUrl)) return null;
    const basePath = new URL(storagePublicUrl).pathname.replace(/\/+$/, '');
    const storedUrl = new URL(decoded);
    return storedUrl.pathname.startsWith(`${basePath}/zetora/hermes-media/${ownerUserId}/`)
      ? storedUrl.toString()
      : null;
  }

  let parsed: URL;
  let res: Response;
  let body: Uint8Array;
  try {
    ({ response: res, url: parsed } = await fetchPublicUrl(sourceUrl, {
      timeoutMs: ATTACHMENT_TIMEOUT_MS,
      maxRedirects: MEDIA_REDIRECTS,
    }));
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    body = await readBodyCapped(res, MAX_MEDIA_BYTES);
  } catch (error) {
    log.warn('Could not re-host Hermes media:', error);
    return null;
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const ext = sanitizeExtension(parsed.pathname.split('.').pop());
  const key = `zetora/hermes-media/${ownerUserId}/${nanoid()}.${ext}`;
  await storageClient.send(
    new PutObjectCommand({ Bucket: storageBucket, Key: key, Body: body, ContentType: contentType }),
  );
  return `${storagePublicUrl}/${key}`;
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
  timeout_s?: number;
  draft_id?: number;
  final?: boolean;
}

type MessagePart = { type: string; [key: string]: unknown };

// Hermes never sends `timeout_s` for the prompt kinds used here (slash-confirm, exec
// approval, clarify). This matches tools/slash_confirm.py's DEFAULT_TIMEOUT_SECONDS, the
// shortest expiry a prompt has Hermes-side, so a stale button is flagged before a press
// is silently ignored. Typing /approve, /always or /cancel still works after it.
const DEFAULT_PROMPT_TIMEOUT_S = 300;

// The agent's response time: from the user message this reply answers to the reply's
// arrival. The gateway's reply_to is the inbound event's message_id, which is Zetora's own
// user-message id (app/api/hermes/send/route.ts). A send with no reply_to — a scheduled
// delivery, say — gets no response time rather than a misleading "since your last
// message", and so does a reply_to that doesn't name a user message in this chat.
async function secondsSinceTriggeringMessage(
  replyTo: string | null | undefined,
  chatId: string,
  now: Date,
): Promise<number | null> {
  if (!replyTo) return null;
  const [trigger] = await getMessageById({ id: replyTo });
  if (!trigger || trigger.chatId !== chatId || trigger.role !== 'user') return null;
  return (now.getTime() - trigger.createdAt.getTime()) / 1000;
}

// Called by hermes-relay-service for each `outbound` frame from the gateway: the agent's
// send/edit/typing/draft/prompt/react/send_media actions (RelayAdapter in
// gateway/relay/adapter.py). `follow_up` and threads are not handled. `task_card` ops are
// Slack-only on the gateway side, so they never reach a relay conversation.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

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

    // Resolved by action.chat_id, not connectorId: a connector owns one hermesConversation
    // per chat that used Agent mode. chat_id is on every outbound op and echoes the chatId
    // /api/hermes/send sent as SessionSource.chat_id.
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

    if (action.op === 'draft') {
      // Progressive streaming: a draft carries the reply's text so far and is replaced
      // by the next one. The final reply comes as a real `send`, which persists and
      // notifies, so nothing is stored here. The gateway waits on this response for
      // every frame, so this path must stay a single publish.
      await publishHermesEvent(conversation.chatId, {
        kind: 'draft',
        draftId: action.draft_id ?? 0,
        content: action.content ?? '',
        final: Boolean(action.final),
      });
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
      // Acknowledged so the gateway treats it as delivered, but never stored or shown.
      if (isUnactionableHomeChannelNotice(action.content)) {
        return NextResponse.json({ success: true });
      }
      parts = [{ type: 'text', text: action.content }];
    } else if (action.op === 'prompt') {
      if (!action.content || !action.prompt_id || !Array.isArray(action.options)) {
        return NextResponse.json({ success: false, error: 'missing_content' });
      }
      const timeoutS = typeof action.timeout_s === 'number' ? action.timeout_s : DEFAULT_PROMPT_TIMEOUT_S;
      parts = [
        { type: 'text', text: action.content },
        {
          type: 'data-hermes_prompt',
          data: {
            promptId: action.prompt_id,
            promptKind: action.prompt_kind ?? 'choice',
            content: action.content,
            options: action.options,
            expiresAt: Date.now() + timeoutS * 1000,
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
    const completionTime = await secondsSinceTriggeringMessage(action.reply_to, conversation.chatId, createdAt);

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
          completionTime,
          searchVector: null,
          isCompactionSummary: false,
          compactionReplacedCount: null,
          hermesReaction: null,
          hermesGatewayId: connector.gatewayId,
        },
      ],
    });

    await publishHermesEvent(conversation.chatId, {
      kind: 'message',
      message: {
        id: messageId,
        role: 'assistant',
        parts,
        createdAt,
        metadata: { completionTime, hermesGatewayId: connector.gatewayId },
      },
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
