'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const continuedChatSchema = z.object({
  agent: z.enum(['zetora', 'hermes']),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
});

export type ContinuedVoiceChat = z.infer<typeof continuedChatSchema>;

// The chat the voice page continues (app/api/voice/transcript): who answers it, and its
// latest messages to show above the session's own turns. Read again on each refetch, so
// a new session on the same page also shows the turns of the one before.
export function useContinuedVoiceChat(chatId: string | undefined) {
  return useQuery({
    queryKey: ['continuedVoiceChat', chatId],
    queryFn: async (): Promise<ContinuedVoiceChat> => {
      const response = await fetch(`/api/voice/transcript?chatId=${encodeURIComponent(chatId ?? '')}`);
      if (!response.ok) {
        throw new Error(response.status === 404 ? 'This chat was not found' : 'Could not load this chat');
      }
      return continuedChatSchema.parse(await response.json());
    },
    enabled: chatId !== undefined,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
