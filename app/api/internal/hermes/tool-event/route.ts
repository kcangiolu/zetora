import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import {
  finishHermesToolStep,
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getMessageById,
  startHermesToolStep,
} from '@/lib/db/queries';
import { publishHermesEvent } from '@/lib/hermes/realtime';
import { parseHermesToolEvent, toHermesToolStepView } from '@/lib/hermes/tool-steps';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-tool-event');

// Called by hermes-relay-service for each tool step Zetora's Hermes plugin reports
// (hermes-relay-service/src/index.ts's handleToolEvent, which has already checked the
// gateway's bearer token). Records the step and pushes it to any open tab of the chat.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  const authError = assertInternalHermesAuth(req);
  if (authError) return authError;

  let body: { gatewayId?: unknown; event?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const event = parseHermesToolEvent(body.event);
  if (typeof body.gatewayId !== 'string' || !event) {
    return NextResponse.json({ success: false, error: 'invalid_event' }, { status: 400 });
  }

  try {
    const connector = await getHermesConnectorByGatewayId(body.gatewayId);
    if (!connector) {
      return NextResponse.json({ success: false, error: 'unknown_gateway' });
    }
    const conversation = await getHermesConversationByChatId(event.chatId);
    if (!conversation || conversation.connectorId !== connector.id) {
      return NextResponse.json({ success: false, error: 'no_conversation' });
    }

    let step;
    if (event.phase === 'started') {
      // The plugin only knows the message id Hermes admitted; it ties the step to a turn
      // only if it really is a user message of this chat.
      const [trigger] = event.triggerMessageId ? await getMessageById({ id: event.triggerMessageId }) : [];
      const triggerMessageId =
        trigger && trigger.chatId === event.chatId && trigger.role === 'user' ? trigger.id : null;
      step = await startHermesToolStep({
        chatId: event.chatId,
        toolCallId: event.toolCallId,
        triggerMessageId,
        toolName: event.toolName,
        preview: event.preview,
      });
    } else {
      step = await finishHermesToolStep(event);
      if (!step) {
        return NextResponse.json({ success: false, error: 'unknown_step' });
      }
    }

    await publishHermesEvent(event.chatId, { kind: 'tool_step', step: toHermesToolStepView(step) });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to record Hermes tool step:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
