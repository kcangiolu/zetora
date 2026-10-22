import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import { getHermesConnectorByGatewayId, getHermesConversationByChatId } from '@/lib/db/queries';
import { publishHermesEvent } from '@/lib/hermes/realtime';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-turn-event');

const eventSchema = z.object({ chatId: z.string().min(1), response: z.string().nullable() });

// Called by hermes-relay-service when Zetora's Hermes plugin reports the end of an agent
// turn (hermes-relay-service/src/index.ts's handleTurnEvent, which has already checked the
// gateway's bearer token). The relay contract has no end-of-turn frame; the voice page
// needs one to know the agent has finished speaking. Nothing is stored: the turn's
// messages arrive on their own.
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

  const event = eventSchema.safeParse(body.event);
  if (typeof body.gatewayId !== 'string' || !event.success) {
    return NextResponse.json({ success: false, error: 'invalid_event' }, { status: 400 });
  }

  try {
    const connector = await getHermesConnectorByGatewayId(body.gatewayId);
    if (!connector) {
      return NextResponse.json({ success: false, error: 'unknown_gateway' });
    }
    const conversation = await getHermesConversationByChatId(event.data.chatId);
    if (!conversation || conversation.connectorId !== connector.id) {
      return NextResponse.json({ success: false, error: 'no_conversation' });
    }

    await publishHermesEvent(event.data.chatId, { kind: 'turn_end', response: event.data.response });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to publish a Hermes turn end:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
