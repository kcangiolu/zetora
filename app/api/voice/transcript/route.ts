import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getChatByIdForValidation,
  getHermesChatLock,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
} from '@/lib/db/queries';
import { textOfParts } from '@/lib/text-parts';
import { generateTitleFromUserMessage, UNTITLED_CHAT_TITLE } from '@/lib/search/chat-title';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-voice-transcript');

const TITLE_MAX_CHARS = 80;
// What a continued chat hands the Voice model: its latest messages, each cut short, so a
// long written chat does not weigh on every spoken turn.
const HISTORY_MAX_MESSAGES = 20;
const HISTORY_MESSAGE_MAX_CHARS = 2000;

const partsSchema = z.array(z.record(z.string(), z.unknown()));

const bodySchema = z.object({
  chatId: z.string().uuid(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1) }))
    .min(1)
    .max(2),
});

// Called by the s2s-service when the voice page continues a chat in Zetora mode: the chat's
// latest messages, as the Voice model's conversation so far.
export async function GET(req: NextRequest) {
  const userId = await resolveVoiceRequestUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = z.string().uuid().safeParse(req.nextUrl.searchParams.get('chatId'));
  if (!chatId.success) return NextResponse.json({ error: 'chatId is required' }, { status: 400 });

  const chat = await getChatByIdForValidation({ id: chatId.data });
  if (!chat || chat.userId !== userId) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  if ((await getHermesChatLock(chatId.data)) === 'hermes') {
    return NextResponse.json({ error: 'This conversation belongs to Hermes Agent' }, { status: 409 });
  }

  const rows = await getMessagesByChatId({ id: chatId.data, limit: HISTORY_MAX_MESSAGES, mostRecent: true });
  const messages = rows.flatMap((row) => {
    const parts = partsSchema.safeParse(row.parts);
    const text = parts.success ? textOfParts(parts.data).trim() : '';
    if ((row.role !== 'user' && row.role !== 'assistant') || row.isCompactionSummary || !text) return [];
    return [{ role: row.role, content: text.slice(0, HISTORY_MESSAGE_MAX_CHARS) }];
  });
  return NextResponse.json({ messages });
}

// Called by the s2s-service after each turn the Voice model answers on the voice page
// (Zetora mode), so the conversation can be read and continued as a chat, like a Hermes
// voice conversation is. Turns arrive one at a time, in order; the first creates the chat.
export async function POST(req: NextRequest) {
  const userId = await resolveVoiceRequestUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'chatId and messages are required' }, { status: 400 });
  const { chatId, messages } = parsed.data;

  const existingChat = await getChatByIdForValidation({ id: chatId });
  if (existingChat && existingChat.userId !== userId) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }
  if (existingChat && (await getHermesChatLock(chatId)) === 'hermes') {
    return NextResponse.json({ error: 'This conversation belongs to Hermes Agent' }, { status: 409 });
  }

  const firstUserText = messages.find((m) => m.role === 'user')?.text;
  if (!existingChat) {
    // Provisional until the generated title lands, so the sidebar never shows a blank row.
    const titleSource = firstUserText ?? 'Voice conversation';
    await saveChat({
      id: chatId,
      userId,
      title: titleSource.length > TITLE_MAX_CHARS ? `${titleSource.slice(0, TITLE_MAX_CHARS - 3)}...` : titleSource,
      visibility: 'private',
    });
  }

  // One millisecond apart: both rows of a turn are written at once, and the chat orders
  // its messages by creation time.
  const now = Date.now();
  await saveMessages({
    messages: messages.map((m, i) => ({
      id: crypto.randomUUID(),
      chatId,
      role: m.role,
      parts: [{ type: 'text' as const, text: m.text }],
      attachments: [],
      createdAt: new Date(now + i),
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
    })),
  });

  if (!existingChat && firstUserText) {
    after(async () => {
      try {
        const title = await generateTitleFromUserMessage({
          message: { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: firstUserText }] },
          userId,
        });
        // Generation disabled in the user's preferences: the provisional title stays.
        if (title !== UNTITLED_CHAT_TITLE) await updateChatTitleById({ chatId, title });
      } catch (error) {
        log.error('Failed to generate a voice chat title:', error);
      }
    });
  }

  return NextResponse.json({ success: true });
}
