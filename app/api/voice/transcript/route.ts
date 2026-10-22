import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getChatByIdForValidation,
  getHermesChatLock,
  saveChat,
  saveMessages,
  updateChatTitleById,
} from '@/lib/db/queries';
import { generateTitleFromUserMessage, UNTITLED_CHAT_TITLE } from '@/lib/search/chat-title';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-voice-transcript');

const TITLE_MAX_CHARS = 80;

const bodySchema = z.object({
  chatId: z.string().uuid(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1) }))
    .min(1)
    .max(2),
});

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
