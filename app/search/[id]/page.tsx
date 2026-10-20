import { notFound, redirect } from 'next/navigation';
import { ChatInterface } from '@/components/chat-interface';
import { getUser } from '@/lib/auth-utils';
import {
  getChatWithUserAndInitialMessages,
  getHermesConversationByChatId,
  getHermesToolStepsByChatId,
  getHiddenContextImageUrlsByChatId,
} from '@/lib/db/queries';
import { resolveHermesChatLock } from '@/lib/hermes/chat-mode';
import { isHermesEnabled } from '@/lib/hermes/enabled';
import { toHermesToolStepView } from '@/lib/hermes/tool-steps';
import { maindb } from '@/lib/db';
import { getChatById } from '@/lib/db/queries';
import { chat as chatTable, message as messageTable, Message, type Chat, type User } from '@/lib/db/schema';
import { Metadata } from 'next';
import { convertToUIMessages } from '@/lib/chat-messages';
import { eq } from 'drizzle-orm';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const CHAT_PRIMARY_BACKOFF_MAX_WAIT_MS = 15_000;
const CHAT_PRIMARY_BACKOFF_INITIAL_DELAY_MS = 250;
const CHAT_PRIMARY_BACKOFF_MAX_DELAY_MS = 2_000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreshUserFromSession(): Promise<User | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  return (session?.user as User | null) ?? null;
}

async function getChatWithMessagesFromPrimary({
  id,
}: {
  id: string;
}): Promise<{ chat: Chat | null; messages: Message[] }> {
  const chat = (await maindb.query.chat.findFirst({ where: eq(chatTable.id, id) })) ?? null;

  if (!chat) {
    return { chat: null, messages: [] };
  }

  const messages = await maindb.query.message.findMany({
    where: eq(messageTable.chatId, id),
    orderBy: (fields, { asc }) => [asc(fields.createdAt), asc(fields.id)],
  });

  return { chat: chat as unknown as Chat, messages: messages as unknown as Message[] };
}

async function getChatWithMessagesFromPrimaryWithBackoff(
  id: string,
): Promise<{ chat: Chat | null; messages: Message[] }> {
  const deadline = Date.now() + CHAT_PRIMARY_BACKOFF_MAX_WAIT_MS;
  let delayMs = CHAT_PRIMARY_BACKOFF_INITIAL_DELAY_MS;
  let result: { chat: Chat | null; messages: Message[] } = { chat: null, messages: [] };

  while (Date.now() < deadline) {
    result = await getChatWithMessagesFromPrimary({ id });
    if (result.chat) {
      return result;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(delayMs, remaining));
    delayMs = Math.min(delayMs * 2, CHAT_PRIMARY_BACKOFF_MAX_DELAY_MS);
  }

  return result;
}

// metadata
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = (await params).id;
  const chat = await getChatById({ id });

  if (!chat) {
    return { title: 'Zetora Chat' };
  }

  const title = chat.title;
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const siteName = new URL(appOrigin).hostname;

  return {
    title: title,
    description: `A search in ${siteName}`,
    openGraph: {
      title: title,
      url: `/search/${id}`,
      description: `A search in ${siteName}`,
      siteName,
      images: [
        {
          url: `/api/og/chat/${id}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: title,
      url: `/search/${id}`,
      description: `A search in ${siteName}`,
      siteName,
      images: [
        {
          url: `/api/og/chat/${id}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    alternates: {
      canonical: `/search/${id}`,
    },
  } as Metadata;
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  const { user, chatBundle, primaryFallback, hiddenImageUrls, hermesConversation, hermesToolSteps } = await all(
    {
      user: async function () {
        return getUser();
      },
      chatBundle: async function () {
        return getChatWithUserAndInitialMessages({
          id,
        });
      },
      primaryFallback: async function () {
        const { chat, messages } = await this.$.chatBundle;
        if (chat && messages.length > 0) return null;
        return getChatWithMessagesFromPrimaryWithBackoff(id);
      },
      hiddenImageUrls: async function () {
        return getHiddenContextImageUrlsByChatId({ chatId: id });
      },
      // Resolved here rather than by a client query so the answer exists on the very first
      // render: it decides how this chat's messages render, and a value that arrives late
      // (or resolves to a cached failure) makes them render as the wrong kind of chat.
      hermesConversation: async function () {
        return isHermesEnabled() ? getHermesConversationByChatId(id) : null;
      },
      hermesToolSteps: async function () {
        return (await this.$.hermesConversation) ? getHermesToolStepsByChatId(id) : [];
      },
    },
    getBetterAllOptions(),
  );

  // Use optimized combined query to get chat, user, and messages in fewer DB calls
  let { chat, messages: messagesFromDb } = chatBundle;

  // Lookout/scheduled runs create chats server-side; replica reads can lag.
  // If the replica returns no chat or no messages, fall back to the primary DB for fresh reads.
  if (primaryFallback) {
    chat = primaryFallback.chat ?? chat;
    if (primaryFallback.messages.length > 0) {
      messagesFromDb = primaryFallback.messages;
    }
  }

  if (!chat) notFound();

  // Check visibility and ownership
  let effectiveUser = user;
  if (chat.visibility === 'private') {
    // Guard against stale in-process session cache returning null while
    // the request cookie is actually valid (prevents /search -> /sign-in -> / loop).
    if (!effectiveUser) {
      effectiveUser = await getFreshUserFromSession();
    }

    if (!effectiveUser) {
      redirect(`/sign-in?redirectTo=/search/${id}`);
    }

    if (effectiveUser.id !== chat.userId) {
      return notFound();
    }
  }

  const initialMessages = convertToUIMessages(messagesFromDb);

  // Derived after the primary fallback above, so it reads the message list the page is
  // actually going to render rather than a possibly-empty replica read.
  const initialHermesLock = resolveHermesChatLock({
    hasHermesConversation: Boolean(hermesConversation),
    hasMessages: messagesFromDb.length > 0,
  });

  // Determine if the current user owns this chat
  const isOwner = effectiveUser ? effectiveUser.id === chat.userId : false;

  return (
    <ChatInterface
      key={`chat-interface-${id}`}
      initialChatId={id}
      initialMessages={initialMessages}
      initialVisibility={chat.visibility as 'public' | 'private'}
      isOwner={isOwner}
      chatTitle={chat.title}
      initialHiddenImageUrls={hiddenImageUrls}
      initialHermesLock={initialHermesLock}
      initialHermesToolSteps={hermesToolSteps.map(toHermesToolStepView)}
    />
  );
}
