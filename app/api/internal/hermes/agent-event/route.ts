import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { getHermesConnectorByGatewayId, getHermesConversationByConnectorId, saveMessages } from '@/lib/db/queries';
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
}

type MessagePart = { type: string; [key: string]: unknown };

// Called by hermes-relay-service when the gateway sends an `outbound` frame (the agent's
// send/edit/typing/prompt actions — verified against gateway/relay/adapter.py's RelayAdapter
// directly, not the prose doc: `send` at RelayAdapter.send, `prompt` at
// RelayAdapter._send_prompt). Handles `send` (Phase 1) and `prompt` (Phase 2, native
// interactive buttons — approval/clarify/choice). Anything else fails cleanly so the relay
// service can report a structured `outbound_result` back rather than hanging.
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

  try {
    const connector = await getHermesConnectorByGatewayId(gatewayId);
    if (!connector) {
      return NextResponse.json({ success: false, error: 'unknown_gateway' });
    }

    const conversation = await getHermesConversationByConnectorId(connector.id);
    if (!conversation) {
      return NextResponse.json({ success: false, error: 'no_conversation' });
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
