import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getChatByIdForValidation,
  getHermesConnectorByUserId,
  getHermesConversationByChatId,
  createHermesConversation,
  saveMessages,
} from '@/lib/db/queries';
import { deliverToGateway } from '@/lib/hermes/relay-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-hermes-send');

interface SendBody {
  chatId?: string;
  text?: string;
  promptResponse?: { promptId: string; optionId: string; label?: string };
}

// Outbound path: a Zetora user's message (or a HermesPromptCard button click) to their
// own Hermes agent. Deliberately its own route, not app/api/search — that route is ~1380
// lines of streamText/tool/provider machinery a Hermes turn never touches (see the
// implementation plan's rationale). This route only ever talks to hermes-relay-service,
// never to an LLM.
export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { chatId, text, promptResponse } = body;
  if (!chatId || typeof chatId !== 'string' || !text || typeof text !== 'string') {
    return NextResponse.json({ error: 'chatId and text are required' }, { status: 400 });
  }

  const session = await auth.api.getSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const chat = await getChatByIdForValidation({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
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
  try {
    await saveMessages({
      messages: [
        {
          id: messageId,
          chatId,
          role: 'user',
          parts: [{ type: 'text', text }],
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
    message_type: 'text',
    message_id: messageId,
    source: {
      platform: 'zetora',
      chat_id: chatId,
      chat_type: 'dm',
      user_id: session.user.id,
      user_name: session.user.name,
    },
  };
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
