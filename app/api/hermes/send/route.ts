import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import { resolveHermesAttachments, type HermesAttachmentRef } from '@/lib/hermes/attachments';
import { sendToHermes, type HermesPromptResponse } from '@/lib/hermes/send';
import { getStorageClient } from '@/lib/storage';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SendBody {
  chatId?: string;
  // The id the browser already shows the message under. Hermes's reactions and Zetora's
  // tool steps name the message by id, so taking it keeps them attached before a reload.
  messageId?: string;
  text?: string;
  promptResponse?: HermesPromptResponse;
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
  if (body.messageId !== undefined && (typeof body.messageId !== 'string' || !UUID_PATTERN.test(body.messageId))) {
    return NextResponse.json({ error: 'messageId must be a UUID' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text : '';
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  // A caption-less attachment is a normal message on every other platform Hermes fronts,
  // so text is only required when nothing else carries the message.
  if (!chatId || typeof chatId !== 'string' || (!text && attachments.length === 0)) {
    return NextResponse.json({ error: 'chatId and either text or an attachment are required' }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: req.headers });
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

  const result = await sendToHermes({
    user: { id: session.user.id, name: session.user.name },
    chatId,
    messageId: body.messageId,
    text,
    media,
    promptResponse,
  });
  if (!result.ok) {
    return NextResponse.json(
      result.status === 502 ? { success: false, error: result.error } : { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
