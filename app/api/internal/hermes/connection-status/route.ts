import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { getHermesConversationsByConnectorId, updateHermesConnectorConnectionStatus } from '@/lib/db/queries';
import { publishHermesEvent } from '@/lib/hermes/realtime';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-connection-status');

// Called by hermes-relay-service on every WS connect/disconnect so the Settings > Hermes
// tab's status badge (and, once open, the chat's own live view) reflect reality without
// polling.
export async function POST(req: NextRequest) {
  const authError = assertInternalHermesAuth(req);
  if (authError) return authError;

  let body: { gatewayId?: string; connected?: boolean; error?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { gatewayId, connected, error } = body;
  if (!gatewayId || typeof connected !== 'boolean') {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  try {
    const updated = await updateHermesConnectorConnectionStatus({ gatewayId, connected, error });
    if (!updated) {
      return NextResponse.json({ error: 'unknown_gateway' }, { status: 404 });
    }

    const conversations = await getHermesConversationsByConnectorId(updated.id);
    await Promise.all(
      conversations.map((conversation) =>
        publishHermesEvent(conversation.chatId, { kind: 'connection-status', connected, error: error ?? null }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error('Failed to update Hermes connection status:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
