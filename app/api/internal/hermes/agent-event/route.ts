import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import {
  getHermesConnectorByGatewayId,
  getHermesConversationByConnectorId,
  getMessageById,
  updateMessagePartsById,
  updateMessageHermesReaction,
  saveMessages,
} from '@/lib/db/queries';
import { publishHermesEvent, isHermesChatViewerActive } from '@/lib/hermes/realtime';
import { sendPushToUser } from '@/lib/push/send-push';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-agent-event');

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
}

type MessagePart = { type: string; [key: string]: unknown };

// Called by hermes-relay-service when the gateway sends an `outbound` frame (the agent's
// send/edit/typing/prompt/react actions — verified against gateway/relay/adapter.py's
// RelayAdapter directly, not the prose doc: `send` at RelayAdapter.send, `edit` at
// .edit_message, `typing` at .send_typing, `prompt` at ._send_prompt, `react` at ._react).
// follow_up/send_media/threads are each a bigger, separately-scoped feature (proactive
// session_key routing and a media re-host endpoint respectively) — not handled here.
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

    const conversation = await getHermesConversationByConnectorId(connector.id);
    if (!conversation) {
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
      const body = action.content!.length > 160 ? `${action.content!.slice(0, 157)}...` : action.content!;
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
