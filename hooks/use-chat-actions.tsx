'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Pencil, Trash2, X } from 'lucide-react';
import { sileo } from 'sileo';

import { bulkDeleteChats, deleteChat, updateChatTitle } from '@/app/actions';
import { getChatIdFromPath } from '@/lib/chat-route';
import { CHAT_TITLE_MAX_LENGTH } from '@/lib/constants';

// Every list that shows chats: the sidebar, the history dialog and the
// searches page, plus the open chat's header.
const CHAT_LIST_QUERY_KEYS = [['recent-chats'], ['chats'], ['searches']] as const;

/**
 * Rename and delete for chats, shared by the sidebar, the chat header, the
 * history dialog and the searches page. Each action reports its outcome in a
 * toast, refreshes every chat list and resolves to whether it succeeded.
 */
export function useChatActions() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();

  const refreshChatLists = useCallback(() => {
    for (const queryKey of CHAT_LIST_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const renameChat = useCallback(
    async (chatId: string, rawTitle: string): Promise<boolean> => {
      const title = rawTitle.trim();
      if (!title) {
        sileo.error({ title: 'Title cannot be empty', icon: <AlertCircle className="h-4 w-4" /> });
        return false;
      }
      if (title.length > CHAT_TITLE_MAX_LENGTH) {
        sileo.error({
          title: `Title is too long (max ${CHAT_TITLE_MAX_LENGTH} characters)`,
          icon: <AlertCircle className="h-4 w-4" />,
        });
        return false;
      }

      try {
        if (!(await updateChatTitle(chatId, title))) throw new Error('The chat was not updated');
      } catch (error) {
        console.error('Error renaming chat:', error);
        sileo.error({
          title: 'Failed to rename chat',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
        return false;
      }

      queryClient.setQueriesData<{ title: string } | null>({ queryKey: ['chat-meta', chatId] }, (meta) =>
        meta ? { ...meta, title } : meta,
      );
      refreshChatLists();
      sileo.success({ title: 'Chat renamed', icon: <Pencil className="h-4 w-4" /> });
      return true;
    },
    [queryClient, refreshChatLists],
  );

  const deleteChats = useCallback(
    async (chatIds: string[]): Promise<boolean> => {
      if (chatIds.length === 0) return true;
      try {
        if (chatIds.length === 1) {
          await deleteChat(chatIds[0]);
        } else {
          await bulkDeleteChats(chatIds);
        }
      } catch (error) {
        console.error('Error deleting chats:', error);
        sileo.error({
          title: chatIds.length === 1 ? 'Failed to delete chat' : 'Failed to delete chats',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
        return false;
      }

      refreshChatLists();
      sileo.success({
        title: chatIds.length === 1 ? 'Chat deleted' : `${chatIds.length} chats deleted`,
        icon: <Trash2 className="h-4 w-4" />,
      });
      const openChatId = getChatIdFromPath(pathname);
      if (openChatId && chatIds.includes(openChatId)) {
        router.push('/');
      }
      return true;
    },
    [pathname, router, refreshChatLists],
  );

  return { renameChat, deleteChats };
}
