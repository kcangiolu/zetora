'use client';

// React and React-related imports
import React, { memo, useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react';
import Link from 'next/link';

// Third-party library imports
import { useChat } from '@ai-sdk/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { UserCircleIcon } from '@hugeicons/core-free-icons';
import { PlusIcon } from '@phosphor-icons/react';
import { useRouter, usePathname } from 'next/navigation';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { sileo } from 'sileo';
import { v7 as uuidv7 } from 'uuid';

// Internal app imports
import { suggestQuestions, updateChatVisibility, getChatMeta } from '@/app/actions';

// Component imports
import { ChatDialogs } from '@/components/chat-dialogs';
import Messages, { MessagesHandle } from '@/components/messages';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, useSidebar, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import FormComponent from '@/components/ui/form-component';
import { ShareDialog } from '@/components/share/share-dialog';
import { ExampleCategories } from '@/components/example-categories';
import {
  Pencil,
  Trash2,
  Share as ShareIcon,
  ChevronDown,
  X,
  Check,
  ExternalLink,
  FoldVertical,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { setImageContextVisibility, manualCompactChat } from '@/app/actions';
import { ButtonGroup } from '@/components/ui/button-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

// Hook imports
import { useAutoResume } from '@/hooks/use-auto-resume';
import { useHermesStream } from '@/hooks/use-hermes-stream';
import { resolveHermesChatMode, type HermesChatLock } from '@/lib/hermes/chat-mode';
import { useLocalStorage } from '@/hooks/use-local-storage';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';
import { useUser } from '@/contexts/user-context';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { useSessionPreference } from '@/hooks/use-session-preference';

// Utility and type imports
import { ChatSDKError } from '@/lib/errors';
import { cn, SEARCH_GROUP_IDS, SearchGroupId } from '@/lib/utils';
import { AUTO_MODEL_ID, DEFAULT_MODEL_ALIAS } from '@/ai/models';
import { useModels } from '@/hooks/use-models';

// State management imports
import { chatReducer, createInitialState, type ChatState } from '@/components/chat-state';
import { useDataStream } from './data-stream-provider';
import { DefaultChatTransport } from 'ai';
import { ChatMessage } from '@/lib/types';
import { placeCompactionSummary } from '@/lib/compaction-summary';
import type { ElicitationData } from '@/components/mcp-elicitation-modal';
import { useChatActions } from '@/hooks/use-chat-actions';
import { getChatIdFromPath } from '@/lib/chat-route';

interface ChatInterfaceProps {
  initialChatId?: string;
  initialMessages?: any[];
  initialVisibility?: 'public' | 'private';
  isOwner?: boolean;
  chatTitle?: string;
  initialHiddenImageUrls?: string[];
  // Resolved server-side in app/search/[id]/page.tsx. Undefined only on the new-chat entry
  // point (app/(search)/page.tsx), which renders no props at all.
  initialHermesLock?: HermesChatLock;
}

interface AutoRouterConfig {
  routes: Array<{
    name: string;
    description: string;
    model: string;
  }>;
}

const INITIAL_QUERY_DEDUPE_WINDOW_MS = 5000;

const ChatInterface = memo(
  ({
    initialChatId,
    initialMessages,
    initialVisibility = 'private',
    isOwner = true,
    chatTitle,
    initialHiddenImageUrls,
    initialHermesLock = null,
  }: ChatInterfaceProps): React.JSX.Element => {
    const router = useRouter();
    const pathname = usePathname();
    // The chat open on this page; null for a new chat until its first message.
    const openChatId = initialChatId || getChatIdFromPath(pathname);
    const { renameChat, deleteChats } = useChatActions();
    const queryClient = useQueryClient();
    const { state } = useSidebar();
    const [query] = useQueryState('query', parseAsString.withDefault(''));
    const [q] = useQueryState('q', parseAsString.withDefault(''));
    // An unknown ?group= value parses to null and is ignored.
    const [groupParam] = useQueryState('group', parseAsStringLiteral(SEARCH_GROUP_IDS));
    const [input, setInput] = useLocalStorage<string>('zetora-draft-input', '');
    const [localChatTitle, setLocalChatTitle] = useState<string>(chatTitle || (initialChatId ? 'Chat' : 'New Chat'));
    const [hiddenImageUrls, setHiddenImageUrls] = useState<Set<string>>(() => new Set(initialHiddenImageUrls ?? []));
    const [titleInput, setTitleInput] = useState(localChatTitle);
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
    const headerGroupRef = useRef<HTMLDivElement>(null);
    const chevronBtnRef = useRef<HTMLButtonElement>(null);
    const [groupWidth, setGroupWidth] = useState<number>(0);
    const [alignOffset, setAlignOffset] = useState<number>(0);

    const measureHeaderMenuAlignment = React.useCallback(() => {
      const groupEl = headerGroupRef.current;
      if (!groupEl) return;
      const gW = groupEl.offsetWidth;
      setGroupWidth(gW);
      const cW = chevronBtnRef.current ? chevronBtnRef.current.offsetWidth : 0;
      // Align content to be centered within the full button group (not just the chevron)
      // With align="center", a negative offset of half the width difference moves the menu's center
      // from the chevron button to the center of the whole group.
      setAlignOffset(-((gW - cW) / 2));
    }, []);

    useEffect(() => {
      const groupEl = headerGroupRef.current;
      if (!groupEl) return;
      const ro = new ResizeObserver(measureHeaderMenuAlignment);
      ro.observe(groupEl);
      measureHeaderMenuAlignment();
      window.addEventListener('resize', measureHeaderMenuAlignment);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', measureHeaderMenuAlignment);
      };
    }, [measureHeaderMenuAlignment]);

    // Re-measure when path/title changes or when menu opens
    useEffect(() => {
      if (!headerMenuOpen) return;
      // microtask to allow layout to settle when replaceState changes DOM
      queueMicrotask(() => measureHeaderMenuAlignment());
    }, [pathname, localChatTitle, headerMenuOpen, measureHeaderMenuAlignment]);

    const [selectedModel, setSelectedModel] = useLocalStorage('zetora-selected-model', DEFAULT_MODEL_ALIAS);
    // On first visit (no 'zetora-selected-model' ever stored), pre-select the
    // user's "Default Model" preference (Settings → Tertiary Models) instead
    // of leaving the instance's default — mirrors resolveModel's
    // server-side fallback (ai/providers.ts's resolveDefaultModelId) so an
    // explicit preference is honored everywhere, not just in the background.
    const [defaultModelPreference, , defaultModelPreferenceResolved] = useSyncedPreferences<string>(
      'zetora-default-model',
      '',
    );
    useEffect(() => {
      if (!defaultModelPreferenceResolved || !defaultModelPreference) return;
      if (typeof window === 'undefined') return;
      if (localStorage.getItem('zetora-selected-model') !== null) return;
      setSelectedModel(defaultModelPreference);
    }, [defaultModelPreferenceResolved, defaultModelPreference, setSelectedModel]);
    const { getModel } = useModels();
    // A stored selection can be the default-model alias, a pre-models.dev id
    // or an id spelled differently than today's — move it to the current one.
    useEffect(() => {
      const model = getModel(selectedModel);
      if (model && model.value !== selectedModel) setSelectedModel(model.value);
    }, [selectedModel, setSelectedModel, getModel]);
    // Session-scoped like selectedModel, not a synced DB preference (the
    // per-task recommended defaults live in Settings instead — see
    // ai/tertiary.ts's TASK_RECOMMENDED_EFFORT for the tertiary equivalent).
    const [reasoningEffort, setReasoningEffort] = useLocalStorage<ReasoningEffort>('zetora-reasoning-effort', 'auto');
    const resolveVisionSupport = useCallback((modelValue: string) => getModel(modelValue)?.vision ?? false, [getModel]);
    // Whether images are injected into the model's context (vs. hosted +
    // handed to it as a URL only). Defaults from the model's vision
    // capability (see useModels).
    // The user can override per-message — switching models recomputes the
    // default (see effect below) but doesn't otherwise touch this state.
    const [visionEnabled, setVisionEnabled] = useState(() => resolveVisionSupport(selectedModel));
    useEffect(() => {
      setVisionEnabled(resolveVisionSupport(selectedModel));
    }, [selectedModel, resolveVisionSupport]);
    const [defaultGroupPreference] = useSyncedPreferences<SearchGroupId>(
      'zetora-default-group',
      'auto' as SearchGroupId,
    );
    const initialGroupDefault = groupParam ?? defaultGroupPreference;
    const [selectedGroup, setSelectedGroup] = useLocalStorage<SearchGroupId>(
      'zetora-selected-group',
      initialGroupDefault,
    );
    const rawSelectedGroup = groupParam ?? selectedGroup;
    // Set the moment this chat's first message is submitted, by whichever lane sent it — the
    // first message decides, so a later one never changes it. A brand-new chat gets no
    // server render (its URL is swapped in with history.replaceState, nothing remounts), so
    // this is the only signal that it has just been committed to a lane.
    const [sessionChatLock, setSessionChatLock] = useState<HermesChatLock>(null);
    const handleHermesMessageSent = useCallback(() => setSessionChatLock((lock) => lock ?? 'hermes'), []);
    // isHermesChat is a fact about this chat's stored data and drives how its messages
    // render; effectiveSelectedGroup is the mode selector and drives where the next message
    // is sent. Conflating the two is what made the Agent UI unreliable — see
    // resolveHermesChatMode's own comment.
    const {
      chatLock,
      isHermesChat,
      effectiveGroup: effectiveSelectedGroup,
    } = resolveHermesChatMode({
      serverLock: initialHermesLock,
      sessionLock: sessionChatLock,
      storedGroup: rawSelectedGroup,
    });
    const [isCustomInstructionsEnabled, setIsCustomInstructionsEnabled] = useLocalStorage(
      'zetora-custom-instructions-enabled',
      true,
    );
    // Simple state for temp chat - no useEffect, just direct localStorage
    const [isTemporaryChatEnabled, _setIsTemporaryChatEnabled] = useState(() => {
      if (typeof window === 'undefined') return false;
      try {
        return localStorage.getItem('zetora-temporary-chat-enabled') === 'true';
      } catch {
        return false;
      }
    });
    const setIsTemporaryChatEnabled = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
      _setIsTemporaryChatEnabled((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        if (typeof window !== 'undefined') {
          localStorage.setItem('zetora-temporary-chat-enabled', String(next));
        }
        return next;
      });
    }, []);

    // Settings page navigation (replaces dialog/hash approach)
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Get persisted values for dialog states
    const [persistedHasShownLookoutAnnouncement, setPersitedHasShownLookoutAnnouncement] = useLocalStorage(
      'zetora-lookout-announcement-shown',
      false,
    );

    const [extremeSearchModel] = useSyncedPreferences<string>('zetora-tertiary-extreme-agent-model', '');
    const [isAutoRouterEnabled] = useSyncedPreferences<boolean>('zetora-auto-router-enabled', false);
    const [autoRouterConfig] = useSyncedPreferences<AutoRouterConfig>('zetora-auto-router-config', { routes: [] });
    const [scrollToLatestOnOpen, , scrollToLatestOnOpenResolved] = useSyncedPreferences<boolean>(
      'zetora-scroll-to-latest-on-open',
      false,
    );
    // Browser-session-only source overrides set from the chat picker (see
    // components/ui/form-component) — never persisted to the account-wide
    // zetora-enabled-sources preference, only sent along with this session's requests.
    const [sessionEnabledSources] = useSessionPreference<string[] | null>('zetora-session-enabled-sources', null);

    // State for tracking the auto-routed model
    const [autoRoutedModel, setAutoRoutedModel] = useState<{ model: string; route: string } | null>(null);

    // Use reducer for complex state management
    const [chatState, dispatch] = useReducer(
      chatReducer,
      createInitialState(initialVisibility, persistedHasShownLookoutAnnouncement),
    );

    const { user, isLoading: isUserLoading } = useUser();

    // Login is required to start a new chat (existing chats — including
    // public shares — stay readable without an account; see access-gate.ts).
    useEffect(() => {
      if (!isUserLoading && !user && !initialChatId) {
        router.push('/sign-in');
      }
    }, [isUserLoading, user, initialChatId, router]);

    const { dataStream, setDataStream } = useDataStream();

    const initialState = useMemo(
      () => ({
        query: query || q,
      }),
      [query, q],
    );

    // The server's title replaces the local one only when it changes, so a
    // rename made here is not undone by the older value still in the props.
    const [syncedChatTitle, setSyncedChatTitle] = useState(chatTitle);
    if (chatTitle !== syncedChatTitle) {
      setSyncedChatTitle(chatTitle);
      if (chatTitle) {
        setLocalChatTitle(chatTitle);
        if (!isEditDialogOpen) setTitleInput(chatTitle);
      }
    }

    const handleStartEditTitle = useCallback(() => {
      if (!openChatId) return;
      setTitleInput(localChatTitle || '');
      setIsEditDialogOpen(true);
    }, [openChatId, localChatTitle]);

    const handleCancelEditTitle = useCallback(() => {
      setIsEditDialogOpen(false);
      setTitleInput(localChatTitle || '');
    }, [localChatTitle]);

    const handleSaveTitle = useCallback(async () => {
      if (!openChatId) return;
      setIsSavingTitle(true);
      try {
        if (await renameChat(openChatId, titleInput)) {
          setLocalChatTitle(titleInput.trim());
          setIsEditDialogOpen(false);
        }
      } finally {
        setIsSavingTitle(false);
      }
    }, [openChatId, titleInput, renameChat]);

    const handleOpenDelete = useCallback(() => {
      if (!openChatId) return;
      setIsDeleteOpen(true);
    }, [openChatId]);

    const handleConfirmDelete = useCallback(async () => {
      if (!openChatId) return;
      setIsDeleting(true);
      try {
        if (await deleteChats([openChatId])) setIsDeleteOpen(false);
      } finally {
        setIsDeleting(false);
      }
    }, [openChatId, deleteChats]);

    const lastSubmittedQueryRef = useRef(initialState.query);
    const messagesRef = useRef<MessagesHandle>(null);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null!);
    const inputRef = useRef<HTMLTextAreaElement>(null!);
    const initializedRef = useRef(false);
    const openChatAutoScrolledRef = useRef<string | null>(null);

    // Messages renders via react-virtuoso, which owns its own internal scroll container —
    // the page/window never scrolls for a tall conversation, so "at bottom" comes from
    // Virtuoso's own atBottomStateChange.
    const handleAtBottomChange = useCallback((atBottom: boolean) => {
      setShowScrollToBottom(!atBottom);
    }, []);

    const handleScrollToBottomClick = useCallback(() => {
      setShowScrollToBottom(false);
      messagesRef.current?.scrollToBottom();
    }, []);

    // Generate a consistent ID for new chats
    const chatId = useMemo(() => initialChatId ?? uuidv7(), [initialChatId]);

    // Reset transient elicitation UI state when chat context changes.
    useEffect(() => {
      setActiveElicitation(null);
      setDataStream([]);
      dismissedElicitationIdsRef.current.clear();
      openedElicitationIdsRef.current.clear();
    }, [chatId, setDataStream]);

    // Any connected account has access to every model — no Pro gate left.
    const effectiveSelectedModel = selectedModel;

    type VisibilityType = 'public' | 'private';

    const isExistingChat = Boolean(openChatId);
    const isTemporaryChat = isTemporaryChatEnabled && !isExistingChat;

    // useChat keeps the transport it got first, so the request reads the
    // current settings through refs, updated after every render.
    const selectedModelRef = useRef(effectiveSelectedModel);
    const reasoningEffortRef = useRef(reasoningEffort);
    const visionEnabledRef = useRef(visionEnabled);
    const selectedGroupRef = useRef(effectiveSelectedGroup);
    const isCustomInstructionsEnabledRef = useRef(isCustomInstructionsEnabled);
    const sessionEnabledSourcesRef = useRef(sessionEnabledSources);
    const isTemporaryChatRef = useRef(isTemporaryChat);
    const skipCacheRef = useRef(false);

    useEffect(() => {
      selectedModelRef.current = effectiveSelectedModel;
      reasoningEffortRef.current = reasoningEffort;
      visionEnabledRef.current = visionEnabled;
      selectedGroupRef.current = effectiveSelectedGroup;
      isCustomInstructionsEnabledRef.current = isCustomInstructionsEnabled;
      sessionEnabledSourcesRef.current = sessionEnabledSources;
      isTemporaryChatRef.current = isTemporaryChat;
    });

    const [activeElicitation, setActiveElicitation] = useState<ElicitationData | null>(null);
    const dismissedElicitationIdsRef = useRef<Set<string>>(new Set());
    const openedElicitationIdsRef = useRef<Set<string>>(new Set());
    const [isTransitioning, setIsTransitioning] = useState(false);
    const lastSuggestionKeyRef = useRef<string | null>(null);

    const transport = useMemo(
      () =>
        new DefaultChatTransport({
          api: '/api/search',
          fetch: async (url, options) => {
            if (options?.body && skipCacheRef.current) {
              const body = JSON.parse(options.body as string);
              body.skipCache = true;
              options.body = JSON.stringify(body);
              skipCacheRef.current = false;
            }
            return fetch(url, options);
          },
          prepareSendMessagesRequest({ messages, body }) {
            // A saved chat's history is read back on the server, so only the
            // new user message is sent; a temporary chat sends all of it.
            const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
            const shouldTrimRequestHistory = Boolean(!isTemporaryChatRef.current && latestUserMessage);

            return {
              body: {
                id: chatId,
                messages: shouldTrimRequestHistory && latestUserMessage ? [latestUserMessage] : messages,
                model: selectedModelRef.current,
                reasoningEffort: reasoningEffortRef.current,
                visionEnabled: visionEnabledRef.current,
                group: selectedGroupRef.current,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                isCustomInstructionsEnabled: isCustomInstructionsEnabledRef.current,
                sessionEnabledSources: sessionEnabledSourcesRef.current,
                isTemporaryChat: isTemporaryChatRef.current,
                ...(initialChatId ? { chat_id: initialChatId } : {}),
                ...body,
              },
            };
          },
        }),
      [chatId, initialChatId],
    );

    const {
      messages,
      sendMessage,
      setMessages,
      regenerate,
      stop: stopStream,
      status,
      error,
      resumeStream,
      clearError,
    } = useChat<ChatMessage>({
      id: chatId,
      // resume: true,
      transport,
      experimental_throttle: 100,
      onData: (dataPart) => {
        // Handle auto-routed model info from server
        if (dataPart.type === 'data-auto_routed_model') {
          const autoRouteData = dataPart.data;
          if (autoRouteData?.model) {
            setAutoRoutedModel({ model: autoRouteData.model, route: autoRouteData.route });
          }
        }
        // Handle MCP elicitation requests.
        if (dataPart.type === 'data-mcp_elicitation') {
          const nextElicitation = dataPart.data as ElicitationData;
          if (!nextElicitation?.elicitationId) return;
          if (dismissedElicitationIdsRef.current.has(nextElicitation.elicitationId)) return;
          if (openedElicitationIdsRef.current.has(nextElicitation.elicitationId)) return;

          openedElicitationIdsRef.current.add(nextElicitation.elicitationId);
          setActiveElicitation((current) =>
            current?.elicitationId === nextElicitation.elicitationId ? current : { ...nextElicitation },
          );
        }
        if (dataPart.type === 'data-mcp_elicitation_done') {
          const doneId = dataPart.data?.elicitationId;
          if (doneId) {
            dismissedElicitationIdsRef.current.add(doneId);
            openedElicitationIdsRef.current.delete(doneId);
            setActiveElicitation((current) => (current?.elicitationId === doneId ? null : current));
          }
        }
        // Handle chat title updates from server for new chats
        if (dataPart.type === 'data-chat_title') {
          const titleData = dataPart.data;
          if (titleData?.title) {
            setLocalChatTitle(titleData.title);
            setTitleInput(titleData.title);
          }
        }
        // Context compaction just ran (lib/search/context-compaction.ts) —
        // optimistically insert/update the synthetic summary message so it
        // renders immediately, without waiting for a reload. A page refresh
        // fetches it from the DB in its real position; this is a best-effort
        // approximation (prepended if new) for live UX.
        if (dataPart.type === 'data-compaction_summary') {
          const summaryData = dataPart.data;
          if (summaryData?.messageId) {
            setMessages((current) => {
              const summaryMessage: ChatMessage = {
                id: summaryData.messageId,
                role: 'assistant',
                parts: [{ type: 'text', text: summaryData.text }],
                metadata: {
                  createdAt: summaryData.createdAt,
                  model: '',
                  completionTime: null,
                  inputTokens: null,
                  outputTokens: null,
                  totalTokens: null,
                  isCompactionSummary: true,
                  compactionReplacedCount: summaryData.replacedCount,
                },
              };
              return placeCompactionSummary(current, summaryMessage);
            });
          }
        }
        // The compaction LLM call itself failed/timed out this turn — the
        // request still completed via the pre-existing drop fallback.
        if (dataPart.type === 'data-context_compaction_warning') {
          if (dataPart.data?.message) {
            sileo.error({ title: 'Context compaction failed', description: dataPart.data.message });
          }
        }
        if (dataPart.type === 'data-context_window_unknown') {
          sileo.info({
            title: 'Context window unknown',
            description: `The model's server did not report its context size, so this answer was limited to ${dataPart.data.tokens.toLocaleString()} tokens of history.`,
          });
        }
        // pruneToContextBudget dropped messages this turn (compaction disabled
        // or failed): tell the user.
        if (dataPart.type === 'data-context_excluded_count') {
          const count = dataPart.data?.count;
          if (count) {
            sileo.info({
              title: 'Some earlier messages were excluded',
              description: `${count} message${count === 1 ? '' : 's'} were left out of this response due to length.`,
            });
          }
        }
        // A resumed/replayed stream (see hooks/use-auto-resume.ts) delivers the
        // missed assistant message as a single transient data part rather than
        // token-by-token deltas. Upsert it live instead of relying on a
        // one-shot read of the accumulated dataStream, so this keeps working
        // no matter how many times a resume happens during the session.
        if (dataPart.type === 'data-appendMessage') {
          const message = JSON.parse(dataPart.data) as ChatMessage;
          setMessages((current) => {
            const exists = current.some((m) => m.id === message.id);
            return exists ? current.map((m) => (m.id === message.id ? message : m)) : [...current, message];
          });
        }
        if (dataPart.type === 'data-mcp_elicitation' || dataPart.type === 'data-mcp_elicitation_done') {
          setDataStream((current) => [...current, dataPart]);
        }
      },
      onFinish: async ({ message }) => {
        // Keep post-finish work minimal so the chat settles quickly after streaming.
        if (user) {
          // Refetch chats cache to refresh sidebar (use refetch to bypass staleTime)
          if (!isTemporaryChatRef.current) {
            queryClient.refetchQueries({ queryKey: ['recent-chats', user.id] });
          }
        }

        // Restore suggested question generation after the assistant finishes.
        if (message.parts && message.role === 'assistant' && (user || chatState.selectedVisibilityType === 'private')) {
          const assistantText = message.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('')
            .trim();
          const userText = (lastSubmittedQueryRef.current ?? '').trim();
          if (!userText || !assistantText) return;
          const suggestionKey = `${userText}::${assistantText}`;
          if (lastSuggestionKeyRef.current === suggestionKey) return;
          lastSuggestionKeyRef.current = suggestionKey;

          const newHistory = [
            { role: 'user', content: userText },
            { role: 'assistant', content: assistantText },
          ];

          void suggestQuestions(newHistory)
            .then(({ questions }) => {
              dispatch({ type: 'SET_SUGGESTED_QUESTIONS', payload: questions });
            })
            .catch((error) => {
              console.error('Error generating suggested questions:', error);
            });
        }
      },
      onError: (error) => {
        // Don't show toast for ChatSDK errors as they will be handled by the enhanced error display
        if (error instanceof ChatSDKError) {
          return;
        }

        console.error('Chat error:', error.cause, error.message);
      },
      messages: initialMessages || [],
    });

    // Merges Hermes agent replies into the same `messages` list the normal LLM path
    // populates — see hooks/use-hermes-stream.ts. The user's own message is appended
    // optimistically by FormComponent's Hermes submit branch, not here.
    // Gated on isHermesChat, not on the mode selector: a Hermes chat keeps receiving its
    // agent's replies regardless of what the selector happens to say, which is what stops
    // the stream from silently detaching mid-conversation. isOwner too, because the route
    // rightly 403s anyone else — a non-owner viewing a public Agent chat would otherwise
    // open a stream only to have it rejected.
    const [hermesTypingLabel, setHermesTypingLabel] = useState<string | null>(null);
    // The agent's reply as it is being written (Hermes's `draft` op). Transient by
    // definition — never persisted, cleared the moment the real message lands — so it
    // lives here rather than in `messages`.
    const [hermesDraft, setHermesDraft] = useState<string | null>(null);
    const [hermesReactions, setHermesReactions] = useState<Record<string, string | null>>({});
    useHermesStream({
      chatId,
      enabled: isHermesChat && isOwner,
      setMessages,
      onTyping: setHermesTypingLabel,
      onDraft: setHermesDraft,
      onReaction: (messageId, emoji) => setHermesReactions((prev) => ({ ...prev, [messageId]: emoji })),
      // Same update a classic turn's `data-chat_title` part applies (onData above), plus the
      // two caches a classic turn refreshes by other means. chat-meta first: the effect that
      // syncs the local title from it would otherwise put back the provisional title it
      // cached when the chat was created. Then the sidebar, which a classic turn refetches in
      // useChat's onFinish — an Agent reply never goes through useChat.
      onTitle: (title) => {
        queryClient.setQueriesData<{ title: string } | null>({ queryKey: ['chat-meta', chatId] }, (meta) =>
          meta ? { ...meta, title } : meta,
        );
        setLocalChatTitle(title);
        setTitleInput(title);
        queryClient.refetchQueries({ queryKey: ['recent-chats'] });
      },
    });

    const [isManuallyStopping, setIsManuallyStopping] = useState(false);
    const uiStatus = isManuallyStopping && status === 'streaming' ? 'ready' : status;

    const stop = useCallback(async () => {
      setIsManuallyStopping(true);
      await Promise.allSettled([stopStream(), fetch(`/api/search/${chatId}/stop`, { method: 'DELETE' })]);
    }, [stopStream, chatId]);

    useEffect(() => {
      if (status !== 'streaming') setIsManuallyStopping(false);
    }, [status]);

    const handleToggleImageHidden = useCallback(
      async (imageUrl: string, hidden: boolean) => {
        const effectiveChatIdForToggle = initialChatId || (messages.length > 0 ? chatId : undefined);
        if (!effectiveChatIdForToggle) return;
        try {
          await setImageContextVisibility({ chatId: effectiveChatIdForToggle, imageUrl, hidden });
          setHiddenImageUrls((prev) => {
            const next = new Set(prev);
            if (hidden) next.add(imageUrl);
            else next.delete(imageUrl);
            return next;
          });
        } catch (error) {
          sileo.error({
            title: `Failed to ${hidden ? 'hide' : 'show'} image: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      },
      [initialChatId, messages.length, chatId],
    );

    const [isCompacting, setIsCompacting] = useState(false);

    const handleManualCompact = useCallback(async () => {
      const currentChatId = initialChatId || (messages.length > 0 ? chatId : undefined);
      if (!currentChatId || isTemporaryChat) return;

      setIsCompacting(true);
      try {
        const result = await manualCompactChat({ chatId: currentChatId, model: effectiveSelectedModel });
        if (result.success) {
          setMessages((current) => {
            const summaryMessage: ChatMessage = {
              id: result.messageId,
              role: 'assistant',
              parts: [{ type: 'text', text: result.text }],
              metadata: {
                createdAt: result.createdAt,
                model: '',
                completionTime: null,
                inputTokens: null,
                outputTokens: null,
                totalTokens: null,
                isCompactionSummary: true,
                compactionReplacedCount: result.replacedCount,
              },
            } as ChatMessage;
            return placeCompactionSummary(current, summaryMessage);
          });
          sileo.success({
            title: 'Conversation compacted',
            description: `${result.replacedCount} message(s) folded into a summary`,
            icon: <FoldVertical className="h-4 w-4" />,
          });
        } else {
          sileo.error({
            title: 'Compaction failed',
            description:
              result.reason === 'not-enough-history'
                ? 'Not enough conversation history to compact yet'
                : 'The summarizer model failed — please try again',
            icon: <X className="h-4 w-4" />,
          });
        }
      } catch (error) {
        sileo.error({
          title: 'Compaction failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          icon: <X className="h-4 w-4" />,
        });
      } finally {
        setIsCompacting(false);
      }
    }, [initialChatId, messages.length, chatId, isTemporaryChat, effectiveSelectedModel, setMessages]);

    // Only a chat that was opened (its page was rendered with an id) jumps to its latest
    // message. A chat started here gets its id mid-stream through history.replaceState
    // and must not jump once the reply finishes.
    useEffect(() => {
      if (!initialChatId) {
        openChatAutoScrolledRef.current = null;
        return;
      }

      if (openChatAutoScrolledRef.current === initialChatId) return;

      // Don't commit to "skip" on the pre-DB-fetch default (false) — that would
      // permanently lock this chat out of auto-scrolling before the real preference
      // value has a chance to arrive.
      if (!scrollToLatestOnOpenResolved) return;

      if (!scrollToLatestOnOpen) {
        openChatAutoScrolledRef.current = initialChatId;
        return;
      }

      if (messages.length === 0 || uiStatus === 'streaming') return;

      openChatAutoScrolledRef.current = initialChatId;
      // Double rAF: wait for Virtuoso to mount and measure its rows before jumping to the end.
      requestAnimationFrame(() => requestAnimationFrame(() => messagesRef.current?.scrollToBottom('auto')));
    }, [initialChatId, messages.length, scrollToLatestOnOpen, scrollToLatestOnOpenResolved, uiStatus]);

    const sendMessageWithAutoRouting = useCallback(
      async (message: Parameters<typeof sendMessage>[0], options?: Parameters<typeof sendMessage>[1]) => {
        const isUsingAutoRouter = selectedModelRef.current === AUTO_MODEL_ID;
        // Every search turn goes through here and no Agent message ever does
        // (form-component sends those via useHermesSend), so this is where a chat whose
        // first message is a search turn becomes search-locked.
        setSessionChatLock((lock) => lock ?? 'search');
        // Prevent stale/ghost elicitation UI from previous requests.
        setActiveElicitation(null);
        // Keep dismissed/opened id sets so historical stream parts can't resurrect.

        // Send message immediately to show in UI
        return sendMessage(message, {
          ...options,
          body: {
            ...(options?.body ?? {}),
            isAutoRouted: isUsingAutoRouter,
            autoRouterEnabled: isAutoRouterEnabled,
            autoRouterConfig: isUsingAutoRouter ? autoRouterConfig : undefined,
          },
        });
      },
      [autoRouterConfig, isAutoRouterEnabled, sendMessage],
    );

    // Fallback: derive active elicitation from streamed data in case onData batching
    // causes event handlers to miss/show late.
    useEffect(() => {
      if (activeElicitation) return;
      if (!dataStream?.length) return;

      const doneIds = new Set(
        dataStream.flatMap((part) => (part.type === 'data-mcp_elicitation_done' ? [part.data.elicitationId] : [])),
      );
      for (let i = dataStream.length - 1; i >= 0; i -= 1) {
        const part = dataStream[i];
        if (!part) continue;
        if (part.type !== 'data-mcp_elicitation') continue;
        const candidate = part.data as ElicitationData;
        if (!candidate?.elicitationId) continue;
        if (doneIds.has(candidate.elicitationId)) continue;
        if (dismissedElicitationIdsRef.current.has(candidate.elicitationId)) continue;
        if (openedElicitationIdsRef.current.has(candidate.elicitationId)) continue;
        openedElicitationIdsRef.current.add(candidate.elicitationId);
        setActiveElicitation((current) =>
          current?.elicitationId === candidate.elicitationId ? current : { ...candidate },
        );
        break;
      }
    }, [dataStream, activeElicitation]);

    const isTemporaryChatLocked = useMemo(() => {
      if (isExistingChat) return true;
      return messages.length > 0 || (initialMessages?.length ?? 0) > 0;
    }, [initialMessages?.length, isExistingChat, messages.length]);

    // Compute active chat id used in header and data fetching (after messages/chatId exist)
    const effectiveChatId = useMemo(() => {
      if (isTemporaryChat) return null;
      return openChatId || (messages.length > 0 ? chatId : null);
    }, [openChatId, messages.length, chatId, isTemporaryChat]);

    const shouldShowHeader = Boolean(user && effectiveChatId);
    const canEditHeader = Boolean(isOwner && shouldShowHeader);
    const headerOffsetClass =
      state === 'expanded' ? 'md:left-[calc(var(--sidebar-width))]' : 'md:left-[calc(var(--sidebar-width-icon))]';

    const { data: chatMeta } = useQuery({
      queryKey: ['chat-meta', effectiveChatId, user?.id],
      enabled: Boolean(effectiveChatId),
      queryFn: async () => await getChatMeta(effectiveChatId as string),
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    });

    // Same rule for the title the chat-meta query fetches.
    const [syncedMetaTitle, setSyncedMetaTitle] = useState(chatMeta?.title);
    if (chatMeta?.title !== syncedMetaTitle) {
      setSyncedMetaTitle(chatMeta?.title);
      if (chatMeta?.title) {
        setLocalChatTitle(chatMeta.title);
        if (!isEditDialogOpen) setTitleInput(chatMeta.title);
      }
    }

    // Handle text highlighting and quoting
    const handleHighlight = useCallback(
      (text: string) => {
        const quotedText = `> ${text.replace(/\n/g, '\n> ')}\n\n`;
        setInput((prev: string) => prev + quotedText);

        // After the quote has rendered into the composer, focus it with the
        // cursor at the end.
        requestAnimationFrame(() => {
          const inputElement = inputRef.current;
          if (!inputElement) return;
          inputElement.focus();
          inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        });
      },
      [setInput],
    );

    useAutoResume({
      // Never in a Hermes chat: resumeStream() re-attaches to /api/search's resumable
      // stream, which a Hermes turn never creates — so the hook's "last message is the
      // user's" condition (true for every Agent chat waiting on its agent) produced a
      // guaranteed not_found:stream error card, complete with Retry and Delete buttons
      // that mean nothing here.
      autoResume: !isManuallyStopping && !isHermesChat,
      initialMessages: initialMessages || [],
      status,
      resumeStream,
      clearError,
    });

    // Removed header/recents invalidation effects; chat meta now refetches based on messages.length via query key

    // Handle initial query from URL params
    useEffect(() => {
      if (!initializedRef.current && initialState.query && !messages.length && !initialChatId) {
        if (typeof window !== 'undefined') {
          const dedupeKey = `zetora:initial-query:${initialState.query}`;
          const previousTimestamp = Number(sessionStorage.getItem(dedupeKey) ?? '0');
          const now = Date.now();
          if (previousTimestamp && now - previousTimestamp < INITIAL_QUERY_DEDUPE_WINDOW_MS) {
            initializedRef.current = true;
            return;
          }
          sessionStorage.setItem(dedupeKey, String(now));
        }

        initializedRef.current = true;

        // Send the message first
        sendMessageWithAutoRouting({
          parts: [{ type: 'text', text: initialState.query }],
          role: 'user',
        });

        // For logged-in users (not in temporary mode), update URL to reflect the chat ID
        if (user && !isTemporaryChat) {
          window.history.replaceState({}, '', `/search/${chatId}`);
        }
      }
    }, [
      initialState.query,
      sendMessageWithAutoRouting,
      setInput,
      messages.length,
      initialChatId,
      user,
      isTemporaryChat,
      chatId,
    ]);

    // Generate suggested questions when opening a chat directly.
    useEffect(() => {
      let isCancelled = false;

      const generateSuggestionsForInitialMessages = () => {
        if (
          initialMessages &&
          initialMessages.length >= 2 &&
          // Never for a Hermes chat: this is a real LLM call, and the follow-ups it
          // produces are answered through /api/search — a native Zetora turn inside a
          // relayed conversation. Gating generation is enough to make that unreachable,
          // since nothing else populates suggestedQuestions in this lane.
          !isHermesChat &&
          !chatState.suggestedQuestions.length &&
          (user || chatState.selectedVisibilityType === 'private') &&
          uiStatus === 'ready'
        ) {
          const lastUserMessage = initialMessages.filter((m) => m.role === 'user').pop();
          const lastAssistantMessage = initialMessages.filter((m) => m.role === 'assistant').pop();

          if (lastUserMessage && lastAssistantMessage) {
            const getMessageText = (message: typeof lastUserMessage) => {
              if (message.parts && message.parts.length > 0) {
                return (message.parts as Array<{ type: string; text?: string }>)
                  .filter((p) => p.type === 'text' && p.text)
                  .map((p) => p.text!)
                  .join('')
                  .trim();
              }

              return message.content || '';
            };

            const newHistory = [
              { role: 'user', content: getMessageText(lastUserMessage) },
              { role: 'assistant', content: getMessageText(lastAssistantMessage) },
            ];
            const userText = newHistory[0].content.trim();
            const assistantText = newHistory[1].content.trim();
            if (!userText || !assistantText) return;
            const suggestionKey = `${userText}::${assistantText}`;
            if (lastSuggestionKeyRef.current === suggestionKey) return;
            lastSuggestionKeyRef.current = suggestionKey;

            void suggestQuestions(newHistory)
              .then(({ questions }) => {
                if (!isCancelled) {
                  dispatch({ type: 'SET_SUGGESTED_QUESTIONS', payload: questions });
                }
              })
              .catch((error) => {
                console.error('Error generating suggested questions:', error);
              });
          }
        }
      };

      generateSuggestionsForInitialMessages();

      return () => {
        isCancelled = true;
      };
    }, [
      initialMessages,
      chatState.suggestedQuestions.length,
      uiStatus,
      user,
      chatState.selectedVisibilityType,
      isHermesChat,
    ]);

    // Reset suggested questions when status changes to streaming
    useEffect(() => {
      if (uiStatus === 'streaming') {
        // Clear suggested questions when a new message is being streamed
        dispatch({ type: 'RESET_SUGGESTED_QUESTIONS' });
      }
    }, [uiStatus]);

    // Reset isTransitioning as soon as the last message becomes an assistant message
    useEffect(() => {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'assistant') {
        setIsTransitioning(false);
      }
    }, [messages]);

    // Dialog management state - track command dialog state in chat state
    useEffect(() => {
      dispatch({
        type: 'SET_ANY_DIALOG_OPEN',
        payload: chatState.commandDialogOpen || chatState.showAnnouncementDialog,
      });
    }, [chatState.commandDialogOpen, chatState.showAnnouncementDialog]);

    // Keyboard shortcut for command dialog
    useEffect(() => {
      const down = (e: KeyboardEvent) => {
        if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          dispatch({ type: 'SET_COMMAND_DIALOG_OPEN', payload: !chatState.commandDialogOpen });
        }
      };

      document.addEventListener('keydown', down);
      return () => document.removeEventListener('keydown', down);
    }, [chatState.commandDialogOpen]);

    // Define the model change handler
    const handleModelChange = useCallback(
      (model: string) => {
        setSelectedModel(model);
        // Clear auto-routed model when switching away from auto
        if (model !== AUTO_MODEL_ID) {
          setAutoRoutedModel(null);
        }
      },
      [setSelectedModel],
    );

    const resetSuggestedQuestions = useCallback(() => {
      dispatch({ type: 'RESET_SUGGESTED_QUESTIONS' });
    }, []);

    const setSuggestedQuestions = useCallback((questions: string[]) => {
      dispatch({ type: 'SET_SUGGESTED_QUESTIONS', payload: questions });
    }, []);

    const setAttachments = useCallback(
      (attachments: React.SetStateAction<ChatState['attachments']>) =>
        dispatch({ type: 'SET_ATTACHMENTS', payload: attachments }),
      [],
    );
    const setHasSubmitted = useCallback(
      (hasSubmitted: React.SetStateAction<boolean>) => dispatch({ type: 'SET_HAS_SUBMITTED', payload: hasSubmitted }),
      [],
    );
    const startTransitioning = useCallback(() => setIsTransitioning(true), []);

    // Handle example selection from ExampleCategories
    const handleExampleSelect = useCallback(
      (text: string, group?: string) => {
        if (group) {
          setSelectedGroup(group as SearchGroupId);
        }

        // Set the input value directly on the DOM element first
        if (inputRef.current) {
          inputRef.current.value = text;
          // Trigger the onChange event manually so React state stays in sync
          const event = new Event('input', { bubbles: true });
          inputRef.current.dispatchEvent(event);

          // Now set the cursor position
          inputRef.current.focus();
          const length = text.length;
          inputRef.current.setSelectionRange(length, length);
        }

        // Also update React state
        setInput(text);
      },
      [setInput, setSelectedGroup],
    );

    // Handle visibility change
    const handleVisibilityChange = useCallback(
      async (visibility: VisibilityType) => {
        if (!chatId) {
          console.warn('handleVisibilityChange: no chatId, ignored');
          return;
        }

        try {
          const result = await updateChatVisibility(chatId, visibility);
          if (result && result.success) {
            dispatch({ type: 'SET_VISIBILITY_TYPE', payload: visibility });

            const appOrigin =
              (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
                (typeof window !== 'undefined' ? window.location.origin : '')) ||
              'http://localhost:3000';
            const shareUrl = visibility === 'public' ? `${appOrigin}/share/${chatId}` : '';
            sileo.success({
              title: `Chat is now ${visibility}`,
              description:
                visibility === 'public' ? 'Your chat is now publicly accessible' : 'Your chat is now private',
              icon: <ShareIcon className="h-4 w-4" />,
              ...(visibility === 'public' && shareUrl
                ? {
                    button: {
                      title: 'Open link',
                      onClick: () => window.open(shareUrl, '_blank', 'noopener,noreferrer'),
                    },
                  }
                : {}),
            });

            // Refetch cache to refresh the list with updated visibility (bypass staleTime)
            if (user) {
              queryClient.refetchQueries({ queryKey: ['recent-chats', user.id] });
            }
          } else {
            console.error('Chat visibility update failed:', result);
            sileo.error({
              title: 'Failed to update chat visibility',
              description: 'Please try again',
              icon: <X className="h-4 w-4" />,
            });
          }
        } catch (error) {
          console.error('Chat visibility update failed:', error);
          sileo.error({
            title: 'Failed to update chat visibility',
            description: 'Please try again',
            icon: <X className="h-4 w-4" />,
          });
        }
      },
      [chatId, queryClient, user],
    );

    // Keyboard shortcut for temporary chat toggle (⌘⇧J)
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'j') {
          e.preventDefault();
          if (!isTemporaryChatLocked) {
            setIsTemporaryChatEnabled((prev) => !prev);
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTemporaryChatLocked, setIsTemporaryChatEnabled]);

    return (
      <>
        <AppSidebar
          chatId={isTemporaryChat ? null : initialChatId || (messages.length > 0 ? chatId : null)}
          selectedVisibilityType={chatState.selectedVisibilityType}
          onVisibilityChange={handleVisibilityChange}
          user={user || null}
          onHistoryClick={() => dispatch({ type: 'SET_COMMAND_DIALOG_OPEN', payload: true })}
          isOwner={isOwner}
          isCustomInstructionsEnabled={isCustomInstructionsEnabled}
          setIsCustomInstructionsEnabledAction={setIsCustomInstructionsEnabled}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
        />
        <SidebarInset>
          {/* Temporary Chat Header - show when in temp mode with messages but no regular header */}
          {user && isTemporaryChat && messages.length > 0 && !shouldShowHeader && (
            <>
              <div
                className={cn(
                  'fixed top-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/80',
                  headerOffsetClass,
                )}
              >
                <div className="flex items-center justify-between px-3 py-2 min-h-10">
                  <div className="flex items-center gap-3">
                    {/* Mobile sidebar trigger */}
                    <div className="md:hidden">
                      <SidebarTrigger className="h-8 w-8" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Temporary Chat</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href="/new">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-lg bg-accent hover:bg-accent/80 group transition-all hover:scale-105 pointer-events-auto"
                      >
                        <PlusIcon size={16} className="group-hover:rotate-90 transition-all" />
                        <span className="text-sm ml-1.5 group-hover:block hidden animate-in fade-in duration-300">
                          New
                        </span>
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
              <div className="h-6" aria-hidden="true" />
            </>
          )}
          {/* Header with Share Button - only for signed-in users and when we have a chat id */}
          {shouldShowHeader && (
            <>
              <div
                className={cn(
                  'fixed top-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/80',
                  headerOffsetClass,
                )}
              >
                <div className="flex items-center justify-between px-3 py-2 min-h-10">
                  <div className="relative flex items-center gap-3 min-w-0 flex-1 justify-center md:justify-start">
                    {/* Mobile sidebar trigger */}
                    <div className="md:hidden absolute left-0 top-1/2 -translate-y-1/2">
                      <SidebarTrigger className="h-8 w-8" />
                    </div>

                    {user ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={cn(
                              'inline-flex items-center justify-center gap-0.5 h-8 w-8 rounded-md',
                              'hover:bg-accent data-[state=open]:bg-accent',
                              'focus:outline-none! focus:ring-0! focus:ring-offset-0!',
                              'transition-colors',
                            )}
                          >
                            <Avatar className="size-7 rounded-md p-0! m-0!">
                              <AvatarImage
                                src={chatMeta?.user?.image ?? user.image ?? ''}
                                alt={chatMeta?.user?.name ?? user.name ?? ''}
                                className="rounded-md p-0! m-0! size-7"
                              />
                              <AvatarFallback className="rounded-md text-xs p-0 m-0 size-7">
                                {(
                                  chatMeta?.user?.name ||
                                  user.name ||
                                  user.email ||
                                  '?'
                                ).charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={6} className="rounded-md w-[260px]">
                          <div className="px-3 py-2">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">Created by</span>
                                <span className="text-xs font-medium truncate">
                                  {(chatMeta?.isOwner ?? isOwner)
                                    ? `${chatMeta?.user?.name || user.name || 'You'} (You)`
                                    : chatMeta?.user?.name || 'Unknown'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">Last Updated</span>
                                <span className="text-xs font-medium">
                                  {new Intl.DateTimeFormat('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                  }).format(chatMeta?.updatedAt ? new Date(chatMeta.updatedAt) : new Date())}
                                </span>
                              </div>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <HugeiconsIcon icon={UserCircleIcon} size={24} className="size-7 shrink-0 self-start" />
                    )}

                    <div className="flex items-center gap-2 min-w-0">
                      {canEditHeader ? (
                        <DropdownMenu
                          open={headerMenuOpen}
                          onOpenChange={(open) => {
                            setHeaderMenuOpen(open);
                          }}
                        >
                          <div ref={headerGroupRef} className="inline-flex">
                            <ButtonGroup className="group gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  'h-8 px-2 w-auto max-w-[250px] justify-start rounded-md hover:bg-accent group-hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed',
                                  headerMenuOpen && 'bg-accent',
                                )}
                                onClick={handleStartEditTitle}
                                disabled={uiStatus === 'submitted' || uiStatus === 'streaming'}
                              >
                                <span className="text-sm font-medium truncate whitespace-nowrap text-left focus:outline-none! focus:ring-0! focus:ring-offset-0!">
                                  {localChatTitle}
                                </span>
                              </Button>
                              <DropdownMenuTrigger
                                asChild
                                className="focus:outline-none! focus:ring-0! focus:ring-offset-0!"
                              >
                                <Button
                                  ref={chevronBtnRef}
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    'h-8 w-8 rounded-md hover:bg-accent group-hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed',
                                    headerMenuOpen && 'bg-accent',
                                  )}
                                  disabled={uiStatus === 'submitted' || uiStatus === 'streaming'}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </ButtonGroup>
                          </div>
                          <DropdownMenuContent
                            side="bottom"
                            align="start"
                            alignOffset={-95}
                            avoidCollisions={false}
                            className="rounded-md border border-border bg-popover shadow-lg p-1"
                          >
                            <DropdownMenuItem
                              className="rounded-md"
                              onClick={handleStartEditTitle}
                              disabled={uiStatus === 'submitted' || uiStatus === 'streaming'}
                            >
                              <Pencil className="h-4 w-4" /> Edit title
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-md"
                              onClick={() => setIsShareOpen(true)}
                              disabled={uiStatus === 'submitted' || uiStatus === 'streaming'}
                            >
                              <ShareIcon className="h-4 w-4" /> Share
                            </DropdownMenuItem>
                            {!isTemporaryChat && (
                              <DropdownMenuItem
                                className="rounded-md"
                                onClick={handleManualCompact}
                                disabled={uiStatus === 'submitted' || uiStatus === 'streaming' || isCompacting}
                              >
                                <FoldVertical className="h-4 w-4" /> {isCompacting ? 'Compacting…' : 'Compact conversation'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={handleOpenDelete}
                              className="text-destructive! hover:text-destructive! rounded-md"
                              disabled={uiStatus === 'submitted' || uiStatus === 'streaming'}
                            >
                              <Trash2 className="h-4 w-4 text-destructive hover:text-destructive/80" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 w-auto max-w-[250px] justify-start rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={handleStartEditTitle}
                          disabled={uiStatus === 'submitted' || uiStatus === 'streaming'}
                        >
                          <span className="text-sm font-medium truncate whitespace-nowrap text-left">
                            {localChatTitle}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2"></div>
                </div>
              </div>
              <div className="h-6" aria-hidden="true" />
            </>
          )}

          <div className="flex flex-col font-sans! items-center h-screen bg-background text-foreground transition-all duration-500 w-full overflow-x-hidden scrollbar-thin! scrollbar-thumb-muted-foreground! dark:scrollbar-thumb-muted-foreground! scrollbar-track-transparent! hover:scrollbar-thumb-foreground! dark:hover:scrollbar-thumb-foreground!">
            {/* Chat Dialogs Component */}
            <ChatDialogs
              commandDialogOpen={chatState.commandDialogOpen}
              setCommandDialogOpen={(open) => dispatch({ type: 'SET_COMMAND_DIALOG_OPEN', payload: open })}
              showLookoutAnnouncement={chatState.showAnnouncementDialog}
              setShowLookoutAnnouncement={(open) => dispatch({ type: 'SET_SHOW_ANNOUNCEMENT_DIALOG', payload: open })}
              hasShownLookoutAnnouncement={chatState.hasShownAnnouncementDialog}
              setHasShownLookoutAnnouncement={(value) => {
                dispatch({ type: 'SET_HAS_SHOWN_ANNOUNCEMENT_DIALOG', payload: value });
                setPersitedHasShownLookoutAnnouncement(value);
              }}
              user={user}
              setAnyDialogOpen={(open) => dispatch({ type: 'SET_ANY_DIALOG_OPEN', payload: open })}
            />

            <div
              className={`w-full p-2 sm:p-4 relative ${
                uiStatus === 'ready' && messages.length === 0
                  ? 'flex-1 flex! flex-col! items-center! justify-center!' // Center everything when no messages
                  : 'flex flex-col! mt-4 flex-1 min-h-0' // Add top margin when showing messages; stretch so the virtualized list below can size against a fixed height
              }`}
            >
              <div
                className={`w-full max-w-[95%] sm:max-w-2xl space-y-6 p-0 mx-auto transition-all duration-300 ${
                  messages.length > 0 ? 'flex flex-col flex-1 min-h-0' : ''
                }`}
              >
                {uiStatus === 'ready' && messages.length === 0 && (
                  <div className="text-center m-0 mb-2">
                    {/* Mobile sidebar trigger for main page */}
                    <div className="md:hidden absolute top-4 left-4 z-10">
                      <SidebarTrigger />
                    </div>
                    {/* Mobile New Chat button for initial state */}
                    <div className="md:hidden absolute top-4 right-4 z-10">
                      <Link href="/new">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="rounded-lg bg-accent hover:bg-accent/80 group transition-all hover:scale-105 pointer-events-auto"
                        >
                          <PlusIcon size={16} className="group-hover:rotate-90 transition-all" />
                          <span className="text-sm ml-1.5 group-hover:block hidden animate-in fade-in duration-300">
                            New
                          </span>
                        </Button>
                      </Link>
                    </div>
                    <div className="inline-flex items-center gap-3">
                      <h1 className="text-4xl sm:text-5xl mb-0! text-foreground dark:text-foreground font-be-vietnam-pro! font-light tracking-tighter">
                        zetora
                      </h1>
                    </div>
                  </div>
                )}

                {/* Use the Messages component */}
                {messages.length > 0 && (
                  <Messages
                    ref={messagesRef}
                    onAtBottomChange={handleAtBottomChange}
                    skipCacheRef={skipCacheRef}
                    messages={messages as ChatMessage[]}
                    setMessages={setMessages}
                    sendMessage={sendMessageWithAutoRouting}
                    regenerate={regenerate}
                    isHermesChat={isHermesChat}
                    hermesTypingLabel={hermesTypingLabel}
                    hermesDraft={hermesDraft}
                    hermesReactions={hermesReactions}
                    stop={stop}
                    suggestedQuestions={chatState.suggestedQuestions}
                    setSuggestedQuestions={setSuggestedQuestions}
                    status={uiStatus}
                    error={error ?? null}
                    user={user}
                    selectedVisibilityType={chatState.selectedVisibilityType}
                    chatId={initialChatId || (messages.length > 0 ? chatId : undefined)}
                    onVisibilityChange={handleVisibilityChange}
                    isOwner={isOwner}
                    hiddenImageUrls={hiddenImageUrls}
                    onToggleImageHidden={handleToggleImageHidden}
                    onHighlight={handleHighlight}
                    isTransitioning={isTransitioning}
                    onBeforeSubmit={startTransitioning}
                  />
                )}
              </div>

              {/* Single Form Component with dynamic positioning */}
              {((user && isOwner) || (!initialChatId && user)) && (
                  <div
                    className={cn(
                      'transition-all duration-100',
                      messages.length === 0 && !chatState.hasSubmitted
                        ? 'relative w-full max-w-2xl mx-auto'
                        : `fixed bottom-0 z-20 pb-6! sm:pb-2.5! mt-1 p-0 w-full max-w-[95%] sm:max-w-2xl mx-auto ${
                            state === 'expanded'
                              ? 'left-0 right-0 md:left-[calc(var(--sidebar-width))] md:right-0'
                              : 'left-0 right-0 md:left-[calc(var(--sidebar-width-icon))] md:right-0'
                          }`,
                    )}
                  >
                    <AnimatePresence>
                      {showScrollToBottom && messages.length > 0 && (
                        <motion.button
                          type="button"
                          initial={{ opacity: 0, y: 8, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                          onClick={handleScrollToBottomClick}
                          aria-label="Scroll to latest message"
                          className="absolute -top-14 left-1/2 -translate-x-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-md hover:bg-accent transition-colors"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                    <FormComponent
                      chatId={chatId}
                      user={user!}
                      input={input}
                      setInput={setInput}
                      attachments={chatState.attachments}
                      setAttachments={setAttachments}
                      fileInputRef={fileInputRef}
                      inputRef={inputRef}
                      stop={stop}
                      messages={messages as ChatMessage[]}
                      setMessages={setMessages}
                      sendMessage={sendMessageWithAutoRouting}
                      selectedModel={selectedModel}
                      setSelectedModel={handleModelChange}
                      reasoningEffort={reasoningEffort}
                      setReasoningEffort={setReasoningEffort}
                      visionEnabled={visionEnabled}
                      setVisionEnabled={setVisionEnabled}
                      resetSuggestedQuestions={resetSuggestedQuestions}
                      lastSubmittedQueryRef={lastSubmittedQueryRef}
                      selectedGroup={effectiveSelectedGroup}
                      setSelectedGroup={setSelectedGroup}
                      hermesChatLock={chatLock}
                      isHermesChat={isHermesChat}
                      onHermesMessageSent={handleHermesMessageSent}
                      showExperimentalModels={messages.length === 0}
                      status={uiStatus}
                      setHasSubmitted={setHasSubmitted}
                      isTemporaryChatEnabled={isTemporaryChat}
                      isTemporaryChat={isTemporaryChat}
                      isTemporaryChatLocked={isTemporaryChatLocked}
                      setIsTemporaryChatEnabled={setIsTemporaryChatEnabled}
                      autoRoutedModel={autoRoutedModel}
                      onBeforeSubmit={startTransitioning}
                    />

                    {/* Example Categories - shown on a fresh, non-temporary chat */}
                    {messages.length === 0 && !chatState.hasSubmitted && !isTemporaryChat && (
                      <div className="mt-5 space-y-2.5">
                        <ExampleCategories onSelectExample={handleExampleSelect} />
                      </div>
                    )}
                  </div>
                )}

              {/* Form backdrop overlay - hides content below form when in submitted mode */}
              {((user && isOwner) || (!initialChatId && user)) &&
                (messages.length > 0 || chatState.hasSubmitted) && (
                  <div
                    className={`fixed right-0 bottom-0! h-24 sm:h-20! z-10 bg-linear-to-t from-background via-background/95 to-background/80 backdrop-blur-sm pointer-events-none ${
                      state === 'expanded'
                        ? 'left-0 md:left-[calc(var(--sidebar-width))]'
                        : 'left-0 md:left-[calc(var(--sidebar-width-icon))]'
                    }`}
                  />
                )}

            </div>
          </div>
        </SidebarInset>
        {!isTemporaryChat && openChatId && (
          <ShareDialog
            isOpen={isShareOpen}
            onOpenChange={setIsShareOpen}
            chatId={openChatId}
            selectedVisibilityType={chatState.selectedVisibilityType}
            onVisibilityChange={handleVisibilityChange}
            isOwner={isOwner}
            user={user}
          />
        )}
        {!isTemporaryChat && openChatId && (
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Edit title</DialogTitle>
              </DialogHeader>
              <div className="pt-2">
                <Input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') handleCancelEditTitle();
                  }}
                  placeholder="Enter title..."
                  maxLength={100}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancelEditTitle}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTitle} disabled={isSavingTitle}>
                  {isSavingTitle ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {initialChatId && (
          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the conversation and its content.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Elicitation UX is rendered inline with MCP tool cards in message parts. */}
      </>
    );
  },
);

// Add a display name for the memoized component for better debugging
ChatInterface.displayName = 'ChatInterface';

export { ChatInterface };
