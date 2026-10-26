import React, { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sileo } from 'sileo';
import { Upload, AlertCircle } from 'lucide-react';
import { Eye } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useWebHaptics } from 'web-haptics/react';
import { UseChatHelpers } from '@ai-sdk/react';

import { getAcceptedFileTypes } from '@/ai/models';
import { useModeAccentStyle, ModeAccentSpread } from '@/components/mode-accent';
import { AudioLinesIcon } from '@/components/ui/audio-lines';
import { Button } from '@/components/ui/button';
import { GripIcon } from '@/components/ui/grip';
import { MagicEditIcon } from '@/components/ui/magic-edit-icon';
import TextRotate from '@/components/ui/text-rotate';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useHermesSend } from '@/hooks/use-hermes-send';
import { useInstanceCapabilities } from '@/hooks/use-instance-capabilities';
import { useIsMobile } from '@/hooks/use-mobile';
import { useModels } from '@/hooks/use-models';
import { ComprehensiveUserData } from '@/hooks/use-user-data';
import { parseStartWithCommand } from '@/lib/chat-commands';
import { HERMES_MAX_ATTACHMENT_BYTES } from '@/lib/hermes/attachments';
import { isHermesEnabled } from '@/lib/hermes/enabled';
import type { HermesChatLock } from '@/lib/hermes/chat-mode';
import { filterHermesCommands, type HermesCommand } from '@/lib/hermes/commands';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';
import { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SearchGroup, SearchGroupId } from '@/lib/search/search-groups';

import { ActiveModeBadge } from './active-mode-badge';
import {
  type Attachment,
  MAX_FILES,
  MAX_INPUT_CHARS,
  ArrowUpIcon,
  StopIcon,
  AttachmentPreview,
} from './attachment-utils';
import { AutocompleteList } from './autocomplete-list';
import { McpServerSelector } from './mcp-server-selector';
import { ModelSwitcher } from './model-switcher';
import { PlusMenu } from './plus-menu';
import { ReasoningEffortToggle } from './reasoning-effort-toggle';
import { TemporaryChatNotice } from './temporary-chat-notice';
import { TriggerPopup } from './trigger-popup';
import { findActiveTrigger, replaceTriggerText, type TriggerChar } from './trigger-text';
import { useAutocomplete } from './use-autocomplete';
import { useComposerAttachments } from './use-composer-attachments';
import { useModeOptions } from './use-mode-options';
import { usePromptEnhancer } from './use-prompt-enhancer';
import { useVoiceInput } from './use-voice-input';
import { VoiceSignInDialog } from './voice-sign-in-dialog';

export interface FormComponentProps {
  input: string;
  setInput: (input: string) => void;
  attachments: Array<Attachment>;
  setAttachments: React.Dispatch<React.SetStateAction<Array<Attachment>>>;
  chatId: string;
  user: ComprehensiveUserData | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  stop: () => void;
  hasMessages: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (value: ReasoningEffort) => void;
  resetSuggestedQuestions: () => void;
  lastSubmittedQueryRef: React.RefObject<string>;
  selectedGroup: SearchGroupId;
  setSelectedGroup: React.Dispatch<React.SetStateAction<SearchGroupId>>;
  // Which mode lane this chat is permanently committed to: the server-resolved lock (see
  // resolveHermesChatLock), or for a chat whose first message was sent in this session, the
  // lane that message took (see resolveHermesChatMode). null only while the chat has no
  // messages yet — still free to become either.
  hermesChatLock?: HermesChatLock;
  // Whether this chat IS a Hermes chat (server lock, or a first Agent message sent in this
  // session). Distinct from selectedGroup === 'hermes', which is only what the NEXT message
  // would do — see resolveHermesChatMode.
  isHermesChat?: boolean;
  // Lets the parent record that this chat has just become a Hermes chat, for the brand-new
  // conversation case where no server-resolved lock exists yet.
  onHermesMessageSent?: () => void;
  status: UseChatHelpers<ChatMessage>['status'];
  setHasSubmitted: React.Dispatch<React.SetStateAction<boolean>>;
  isTemporaryChatEnabled: boolean;
  isTemporaryChat: boolean;
  isTemporaryChatLocked: boolean;
  setIsTemporaryChatEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  autoRoutedModel?: { model: string; route: string } | null;
  onBeforeSubmit?: () => void;
  visionEnabled: boolean;
  onToggleVision: () => void;
}

const TEXTAREA_MAX_HEIGHT = 300;

const textareaStyle: React.CSSProperties = {
  WebkitUserSelect: 'text',
  WebkitTouchCallout: 'none',
  resize: 'none',
};

function IconButtonTooltip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!">
        <span className="font-medium text-[11px]">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

const FormComponent: React.FC<FormComponentProps> = ({
  chatId,
  user,
  input,
  setInput,
  attachments,
  setAttachments,
  sendMessage,
  fileInputRef,
  inputRef,
  stop,
  selectedModel,
  setSelectedModel,
  reasoningEffort,
  setReasoningEffort,
  resetSuggestedQuestions,
  lastSubmittedQueryRef,
  selectedGroup,
  setSelectedGroup,
  hermesChatLock = null,
  isHermesChat = false,
  onHermesMessageSent,
  hasMessages,
  setMessages,
  status,
  setHasSubmitted,
  isTemporaryChatEnabled,
  isTemporaryChat,
  isTemporaryChatLocked,
  setIsTemporaryChatEnabled,
  autoRoutedModel,
  onBeforeSubmit,
  visionEnabled,
  onToggleVision,
}) => {
  const { getModel } = useModels();
  const selectedModelConfig = getModel(selectedModel);
  const sendHermesMessage = useHermesSend(chatId);
  const router = useRouter();
  // Continuing a chat by voice needs the local voice backend.
  const capabilities = useInstanceCapabilities();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const haptics = useWebHaptics();
  const isCompositionActive = useRef(false);
  const postSubmitFileInputRef = useRef<HTMLInputElement>(null);
  const triggerPopupScrollRef = useRef<HTMLDivElement>(null);
  const audioLinesRef = useRef<any>(null);
  const gripIconRef = useRef<any>(null);

  const [showSignInDialog, setShowSignInDialog] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  // '@' lists sources, '/' lists skills and modes (or the Agent's commands).
  const [triggerPopup, setTriggerPopup] = useState<TriggerChar | null>(null);
  const [triggerFilter, setTriggerFilter] = useState('');
  const [triggerHighlightIndex, setTriggerHighlightIndex] = useState(0);

  const isProcessing = status === 'submitted' || status === 'streaming';
  const modeAccentStyle = useModeAccentStyle(selectedGroup);

  const modeOptions = useModeOptions({ user, selectedGroup, setSelectedGroup, hermesChatLock, isHermesChat });
  const { searchGroups, isHermesLocked } = modeOptions;
  const { isEnhancing, isTypewriting, enhance } = usePromptEnhancer({
    input,
    setInput,
    inputRef,
    isProcessing,
    haptics,
  });
  const isEnhancementActive = isEnhancing || isTypewriting;
  const { isRecording, toggleRecording } = useVoiceInput({ setInput, haptics });
  const autocomplete = useAutocomplete({ enabled: !hasMessages && triggerPopup === null });
  const { uploadQueue, isDragging, handleFileChange, removeAttachment, dropHandlers, handlePaste } =
    useComposerAttachments({ attachments, setAttachments });
  const hasPendingFiles = attachments.length > 0 || uploadQueue.length > 0;
  const showAutocomplete = autocomplete.isOpen && !hasMessages && !triggerPopup && !hasPendingFiles;

  const handlePlusMenuOpenChange = useCallback(
    (nextOpen: boolean) => {
      setPlusMenuOpen(nextOpen);
      if (nextOpen) haptics.trigger('light');
    },
    [haptics, setPlusMenuOpen],
  );

  const openTrigger = (trigger: TriggerChar | null, filter = '') => {
    setTriggerPopup(trigger);
    setTriggerFilter(filter);
    setTriggerHighlightIndex(0);
  };

  // While an Agent chat is active, '/' lists the Agent's own commands instead of modes:
  // a command targets the running conversation rather than switching pipelines.
  const isHermesCommandMenu = triggerPopup === '/' && selectedGroup === 'hermes';
  const hermesCommandItems = useMemo(
    () => (isHermesCommandMenu ? filterHermesCommands(triggerFilter) : []),
    [isHermesCommandMenu, triggerFilter],
  );
  const filteredTriggerGroups = useMemo(() => {
    const groups = triggerPopup === '/' ? modeOptions.modeGroups : modeOptions.sourceGroups;
    if (!triggerFilter) return groups;
    const lower = triggerFilter.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(lower) || g.id.toLowerCase().includes(lower));
  }, [triggerPopup, modeOptions.modeGroups, modeOptions.sourceGroups, triggerFilter]);
  // The temporary-chat switch is offered under '/' before a chat starts.
  const showTempInTrigger =
    triggerPopup === '/' &&
    !isHermesCommandMenu &&
    !!user &&
    !hasMessages &&
    (!triggerFilter ||
      'temporary'.includes(triggerFilter.toLowerCase()) ||
      'private'.includes(triggerFilter.toLowerCase()));
  const triggerTotalItems = isHermesCommandMenu
    ? hermesCommandItems.length
    : filteredTriggerGroups.length + (showTempInTrigger ? 1 : 0);

  useEffect(() => {
    if (!triggerPopup) return;
    triggerPopupScrollRef.current
      ?.querySelector(`[data-at-index="${triggerHighlightIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [triggerHighlightIndex, triggerPopup]);

  useEffect(() => {
    if (isRecording) audioLinesRef.current?.startAnimation();
    else audioLinesRef.current?.stopAnimation();
  }, [isRecording]);

  useEffect(() => {
    if (isEnhancementActive) gripIconRef.current?.startAnimation();
    else gripIconRef.current?.stopAnimation();
  }, [isEnhancementActive]);

  // Typing anywhere on the page outside another field types into the composer.
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1) return;
      if (!inputRef.current || document.activeElement === inputRef.current || isRecording) return;

      inputRef.current.focus();
      // A leading space is not worth typing.
      if (event.key === ' ' && input.length === 0) return;
      setInput(input + event.key);
      event.preventDefault();
      if ((event.key === '@' || event.key === '/') && (input.length === 0 || /\s$/.test(input))) {
        openTrigger(event.key);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isRecording, input, setInput, inputRef]);

  const handleRecord = useCallback(() => {
    if (!user && !isRecording) {
      haptics.trigger('warning');
      setShowSignInDialog(true);
      return;
    }
    toggleRecording();
  }, [user, isRecording, haptics, toggleRecording, setShowSignInDialog]);

  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      const value = event.target.value;
      setInput(value);
      if (value.length > MAX_INPUT_CHARS) {
        sileo.error({ title: `Your input exceeds the maximum of ${MAX_INPUT_CHARS} characters.` });
      }

      const active = findActiveTrigger(value, event.target.selectionStart ?? value.length);
      if (active) {
        if (active.trigger !== triggerPopup || active.filter !== triggerFilter) {
          openTrigger(active.trigger, active.filter);
        }
        autocomplete.hide();
      } else {
        openTrigger(null);
        autocomplete.request(value);
      }
    },
    [setInput, autocomplete, triggerPopup, triggerFilter],
  );

  const handleGroupSelect = useCallback(
    (group: SearchGroup) => {
      if (isEnhancing || isTypewriting) return;
      // Picking the active mode again clears it.
      if (group.id === selectedGroup && group.id !== 'auto') {
        setSelectedGroup('auto');
        inputRef.current?.focus();
        return;
      }

      setSelectedGroup(group.id);
      inputRef.current?.focus();
    },
    [setSelectedGroup, selectedGroup, inputRef, isEnhancing, isTypewriting],
  );

  // Replaces the typed trigger and its filter with `insertion` and closes the popup.
  const consumeTriggerText = useCallback(
    (insertion = '') => {
      const textarea = inputRef.current;
      if (textarea && triggerPopup) {
        const replaced = replaceTriggerText(
          textarea.value,
          textarea.selectionStart ?? textarea.value.length,
          triggerPopup,
          insertion,
        );
        if (replaced) {
          setInput(replaced.value);
          requestAnimationFrame(() => {
            inputRef.current?.setSelectionRange(replaced.cursor, replaced.cursor);
            inputRef.current?.focus();
          });
        }
      }
      setTriggerPopup(null);
      setTriggerFilter('');
    },
    [inputRef, setInput, triggerPopup],
  );

  const handleTriggerSelect = useCallback(
    (group: SearchGroup) => {
      handleGroupSelect(group);
      consumeTriggerText();
    },
    [handleGroupSelect, consumeTriggerText],
  );

  const handleHermesCommandSelect = useCallback(
    (command: HermesCommand) => consumeTriggerText(`/${command.name} `),
    [consumeTriggerText],
  );

  const toggleTemporaryChat = useCallback(() => {
    if (!isTemporaryChatLocked) setIsTemporaryChatEnabled((prev: boolean) => !prev);
  }, [isTemporaryChatLocked, setIsTemporaryChatEnabled]);

  const handleTriggerTempSelect = useCallback(() => {
    toggleTemporaryChat();
    consumeTriggerText();
  }, [toggleTemporaryChat, consumeTriggerText]);

  // The + menu's exclusive modes: picking the active one again turns it off.
  const handleModeToggle = useCallback(
    (modeId: SearchGroupId) => {
      setPlusMenuOpen(false);
      const group = searchGroups.find((g) => g.id === modeId);
      if (!group) return;
      if ('requireAuth' in group && group.requireAuth && !user) {
        haptics.trigger('warning');
        router.push('/sign-in');
        return;
      }
      haptics.trigger('selection');
      if (selectedGroup === modeId) setSelectedGroup('auto');
      else handleGroupSelect(group);
    },
    [searchGroups, user, router, selectedGroup, setSelectedGroup, handleGroupSelect, haptics, setPlusMenuOpen],
  );

  useEffect(() => {
    if (status === 'ready' || !inputRef.current) return;
    const focusTimeout = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 300);
    return () => clearTimeout(focusTimeout);
  }, [status, inputRef]);

  // A signed-in user's new chat gets its URL as soon as the first message goes out.
  const updateChatUrl = useCallback(() => {
    if (!user || isTemporaryChatEnabled) return;
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '/new') window.history.pushState({}, '', `/search/${chatId}`);
  }, [user, isTemporaryChatEnabled, chatId]);

  const resetComposer = useCallback(() => {
    setInput('');
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Reset the height at once rather than on the next resize frame, to avoid a jump.
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
  }, [setInput, setAttachments, fileInputRef, inputRef]);

  const fileParts = useCallback(
    () =>
      attachments.map((attachment) => ({
        type: 'file' as const,
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType || attachment.mediaType || '',
      })),
    [attachments],
  );

  const submitToHermes = useCallback(() => {
    const text = input.trim();
    if (!text && attachments.length === 0) {
      haptics.trigger('error');
      sileo.error({ title: 'Please enter a message or attach a file.' });
      return;
    }
    // Uploads accept documents up to 50MB, but the Hermes gateway abandons downloads over
    // HERMES_MAX_ATTACHMENT_BYTES: such a file would never reach the agent.
    const oversized = attachments.filter((attachment) => attachment.size > HERMES_MAX_ATTACHMENT_BYTES);
    if (oversized.length > 0) {
      haptics.trigger('error');
      sileo.error({
        title: 'Too large for your Agent',
        description: `${oversized.map((a) => a.name).join(', ')} — the Agent accepts files up to 25MB.`,
        icon: <AlertCircle className="h-4 w-4" />,
      });
      return;
    }

    haptics.trigger('medium');
    onBeforeSubmit?.();
    setHasSubmitted(true);
    lastSubmittedQueryRef.current = text;
    updateChatUrl();
    // Said before the request goes out: /api/hermes/send creates the row the server lock
    // reads, but this view never re-renders from the server again.
    onHermesMessageSent?.();

    // An Agent turn bypasses useChat and /api/search: the user's message is added here,
    // the agent's reply arrives over the Hermes stream (hooks/use-hermes-stream.ts).
    const files = fileParts();
    const messageId = crypto.randomUUID();
    setMessages((current) => [...current, { id: messageId, role: 'user', parts: [...files, { type: 'text', text }] }]);
    resetComposer();

    sendHermesMessage(text, {
      messageId,
      attachments: files.map(({ url, name, mediaType }) => ({ url, name, mediaType })),
    }).catch((error) => {
      haptics.trigger('error');
      sileo.error({
        title: 'Failed to send to Hermes',
        description: error instanceof Error ? error.message : 'Please try again',
        icon: <AlertCircle className="h-4 w-4" />,
      });
    });
  }, [
    input,
    attachments,
    haptics,
    onBeforeSubmit,
    setHasSubmitted,
    lastSubmittedQueryRef,
    updateChatUrl,
    onHermesMessageSent,
    fileParts,
    setMessages,
    resetComposer,
    sendHermesMessage,
  ]);

  const submitForm = useCallback(() => {
    const refuse = (title: string, description: string) => {
      haptics.trigger('warning');
      sileo.error({ title, description, icon: <AlertCircle className="h-4 w-4" /> });
    };
    if (status !== 'ready') {
      refuse('Please wait for the current response to complete', 'Wait for the current message to finish');
      return;
    }
    if (isRecording) {
      refuse('Please stop recording before submitting', 'Stop the voice recording first');
      return;
    }
    if (input.length > MAX_INPUT_CHARS) {
      refuse(`Input exceeds ${MAX_INPUT_CHARS} characters`, 'Please shorten your message');
      return;
    }

    if (selectedGroup === 'hermes') {
      submitToHermes();
      return;
    }

    if (selectedGroup === 'mcp') {
      const mcpCache = queryClient.getQueryData<{
        servers: Array<{ isEnabled: boolean; authType: string; isOAuthConnected: boolean }>;
      }>(['mcpServers', user?.id]);
      const hasEnabledApp = mcpCache?.servers?.some(
        (s) => s.isEnabled && (s.authType !== 'oauth' || s.isOAuthConnected),
      );
      if (!hasEnabledApp) {
        refuse('No apps enabled', 'Enable at least one app to use this mode');
        return;
      }
    }

    if (!input.trim() && attachments.length === 0) {
      haptics.trigger('error');
      sileo.error({ title: 'Please enter a search query or attach an image.' });
      return;
    }

    haptics.trigger('medium');
    onBeforeSubmit?.();
    setHasSubmitted(true);
    lastSubmittedQueryRef.current = input.trim();
    updateChatUrl();

    const { text: startWithStrippedInput, startWith } = parseStartWithCommand(input);
    sendMessage(
      {
        role: 'user',
        parts: [...fileParts(), { type: 'text', text: startWith ? startWithStrippedInput : input }],
      },
      startWith ? { body: { startWith } } : undefined,
    );

    resetComposer();
    resetSuggestedQuestions();
    autocomplete.clear();

    // On iOS, keeping the focus keeps the keyboard over the answer.
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) inputRef.current?.blur();
    else inputRef.current?.focus();
  }, [
    haptics,
    status,
    isRecording,
    input,
    selectedGroup,
    submitToHermes,
    queryClient,
    user,
    attachments.length,
    onBeforeSubmit,
    setHasSubmitted,
    lastSubmittedQueryRef,
    updateChatUrl,
    sendMessage,
    fileParts,
    resetComposer,
    resetSuggestedQuestions,
    autocomplete,
    inputRef,
  ]);

  const triggerFileInput = useCallback(() => {
    if (attachments.length >= MAX_FILES) {
      sileo.error({ title: `You can only attach up to ${MAX_FILES} images.` });
      return;
    }
    if (status === 'ready') postSubmitFileInputRef.current?.click();
    else fileInputRef.current?.click();
  }, [attachments.length, status, fileInputRef]);

  // ⌘U opens the file picker.
  useEffect(() => {
    const handleFileShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'u') {
        event.preventDefault();
        triggerFileInput();
      }
    };
    document.addEventListener('keydown', handleFileShortcut);
    return () => document.removeEventListener('keydown', handleFileShortcut);
  }, [triggerFileInput]);

  const pickSuggestion = useCallback(
    (suggestion: string) => {
      setInput(suggestion);
      autocomplete.clear();
    },
    [setInput, autocomplete],
  );

  const selectHighlightedTriggerItem = useCallback(() => {
    if (isHermesCommandMenu) {
      const command = hermesCommandItems[triggerHighlightIndex];
      if (command) handleHermesCommandSelect(command);
    } else if (triggerHighlightIndex < filteredTriggerGroups.length) {
      handleTriggerSelect(filteredTriggerGroups[triggerHighlightIndex]);
    } else if (showTempInTrigger) {
      handleTriggerTempSelect();
    }
  }, [
    isHermesCommandMenu,
    hermesCommandItems,
    triggerHighlightIndex,
    handleHermesCommandSelect,
    filteredTriggerGroups,
    handleTriggerSelect,
    showTempInTrigger,
    handleTriggerTempSelect,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const { suggestions, highlightedIndex } = autocomplete;
      if (autocomplete.isOpen) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          autocomplete.setHighlightedIndex((prev) => (prev + step + suggestions.length) % suggestions.length);
          return;
        }
        if (((event.key === 'Enter' && !isCompositionActive.current) || event.key === 'Tab') && highlightedIndex >= 0) {
          event.preventDefault();
          pickSuggestion(suggestions[highlightedIndex]);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          autocomplete.hide();
          autocomplete.setHighlightedIndex(-1);
          return;
        }
      }

      if (triggerPopup && triggerTotalItems > 0) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setTriggerHighlightIndex((prev) => (prev + step + triggerTotalItems) % triggerTotalItems);
          return;
        }
        if ((event.key === 'Enter' && !isCompositionActive.current) || event.key === 'Tab') {
          event.preventDefault();
          selectHighlightedTriggerItem();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setTriggerPopup(null);
          setTriggerFilter('');
          return;
        }
      }

      // Enter sends on desktop (Shift+Enter for a new line); on mobile Enter is a new
      // line and the send button sends.
      if (event.key === 'Enter' && !isCompositionActive.current && !isMobile) {
        event.stopPropagation();
        if (event.shiftKey) return;
        event.preventDefault();
        submitForm();
      }
    },
    [
      autocomplete,
      pickSuggestion,
      triggerPopup,
      triggerTotalItems,
      selectHighlightedTriggerItem,
      isMobile,
      submitForm,
      setTriggerHighlightIndex,
    ],
  );

  const resizeTextarea = useCallback(() => {
    const target = inputRef.current;
    if (!target) return;

    // Collapsing to "auto" to measure can shift the page and the textarea: restore both.
    const prevWindowScroll = window.scrollY;
    const prevTextareaScroll = target.scrollTop;

    target.style.height = 'auto';
    const overflows = target.scrollHeight > TEXTAREA_MAX_HEIGHT;
    target.style.height = `${overflows ? TEXTAREA_MAX_HEIGHT : target.scrollHeight}px`;
    target.style.overflowY = overflows ? 'auto' : 'hidden';

    window.scrollTo({ top: prevWindowScroll });
    target.scrollTop = prevTextareaScroll;
    // Keep the cursor in view when typing at the end of a long prompt.
    if (target.selectionStart === target.value.length) target.scrollTop = target.scrollHeight;
  }, [inputRef]);

  useEffect(() => {
    const frame = requestAnimationFrame(resizeTextarea);
    return () => cancelAnimationFrame(frame);
  }, [input, resizeTextarea]);

  const handleTextareaFocus = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      // A value set from outside (a stored draft, an example) puts the cursor at the start.
      const textarea = e.target;
      if (textarea.value.length > 0 && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
      if (!hasMessages) autocomplete.reopen();
    },
    [hasMessages, autocomplete],
  );

  // Hidden a moment later, so a click on a suggestion (onMouseDown) still lands.
  const handleTextareaBlur = useCallback(() => {
    setTimeout(() => autocomplete.hide(), 150);
  }, [autocomplete]);

  const activeGroup =
    selectedGroup === 'auto' || selectedGroup === 'mcp' ? undefined : searchGroups.find((g) => g.id === selectedGroup);
  const isBusy = isEnhancing || isTypewriting;
  const showRotatingPlaceholder = !isRecording && !input && !isBusy && !hasMessages;

  return (
    <div className={cn('flex flex-col w-full max-w-2xl mx-auto')}>
      <TooltipProvider>
        <div
          data-no-haptics
          className={cn(
            'relative w-full flex flex-col gap-1 rounded-xl transition-all duration-300 font-sans!',
            hasMessages ? 'z-50' : 'z-10',
            isDragging && 'ring-1 ring-border',
            hasPendingFiles
              ? 'bg-primary/5 border border-ring/20 backdrop-blur-md! p-1 shadow-none!'
              : 'bg-transparent',
          )}
          {...dropHandlers}
        >
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-md bg-background/90 rounded-lg border border-dashed border-border/60 flex items-center justify-center z-50 m-2 shadow-xl shadow-black/10 dark:shadow-black/25"
              >
                <div className="flex items-center gap-4 px-6 py-8">
                  <div className="p-3 rounded-full bg-muted shadow-none!">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-sm font-medium text-foreground">Drop images or PDFs here</p>
                    <p className="text-xs text-muted-foreground">Max {MAX_FILES} files (5MB per file)</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            multiple
            onChange={handleFileChange}
            accept={getAcceptedFileTypes(selectedModelConfig)}
            tabIndex={-1}
          />
          <input
            type="file"
            className="hidden"
            ref={postSubmitFileInputRef}
            multiple
            onChange={handleFileChange}
            accept={getAcceptedFileTypes(selectedModelConfig)}
            tabIndex={-1}
          />

          {hasPendingFiles && (
            <div className="flex flex-row gap-2 overflow-x-auto py-2 max-h-28 z-10 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {attachments.map((attachment, index) => (
                <AttachmentPreview
                  key={attachment.url}
                  attachment={attachment}
                  onRemove={() => removeAttachment(index)}
                  isUploading={false}
                />
              ))}
              {uploadQueue.map((filename) => (
                <AttachmentPreview
                  key={filename}
                  attachment={{ url: '', name: filename, contentType: '', size: 0 } as Attachment}
                  onRemove={() => {}}
                  isUploading={true}
                />
              ))}
            </div>
          )}

          <div className="relative" data-form-container>
            {triggerPopup && triggerTotalItems > 0 && (
              <TriggerPopup
                trigger={triggerPopup}
                groups={filteredTriggerGroups}
                hermesCommands={isHermesCommandMenu ? hermesCommandItems : null}
                showTemporaryRow={showTempInTrigger}
                highlightIndex={triggerHighlightIndex}
                onHighlight={setTriggerHighlightIndex}
                selectedGroup={selectedGroup}
                isTemporaryChat={isTemporaryChat}
                isTemporaryChatLocked={isTemporaryChatLocked}
                onSelectGroup={handleTriggerSelect}
                onSelectCommand={handleHermesCommandSelect}
                onSelectTemporary={handleTriggerTempSelect}
                scrollRef={triggerPopupScrollRef}
              />
            )}

            <div className="absolute -inset-1 rounded-2xl bg-primary/3 dark:bg-primary/3 blur-sm! pointer-events-none z-9999 shadow" />
            <div
              className={cn(
                'relative rounded-xl bg-muted! border border-ring/10 focus-within:border-ring/5 transition-colors duration-200',
                showAutocomplete && 'rounded-b-none border-b-transparent',
                modeAccentStyle && 'mode-accent-border',
              )}
              style={modeAccentStyle}
            >
              <ModeAccentSpread selectedGroup={selectedGroup} />
              {isRecording ? (
                <Textarea
                  ref={inputRef}
                  placeholder=""
                  value="◉ Recording..."
                  disabled={true}
                  className="w-full rounded-xl rounded-b-none md:text-base! text-base leading-relaxed bg-muted! border-0! text-muted-foreground! focus:ring-0! focus-visible:ring-0! min-h-0! px-4! py-3.5! touch-manipulation whatsize! text-center cursor-not-allowed shadow-none!"
                  style={textareaStyle}
                  rows={1}
                />
              ) : (
                <Textarea
                  ref={inputRef}
                  placeholder={
                    isEnhancing
                      ? '✨ Enhancing your prompt...'
                      : isTypewriting
                        ? '✨ Writing enhanced prompt...'
                        : hasMessages
                          ? 'Ask a follow-up...'
                          : '' // the rotating placeholder covers a new chat
                  }
                  value={input}
                  onChange={handleInput}
                  onFocus={handleTextareaFocus}
                  onBlur={handleTextareaBlur}
                  disabled={isBusy}
                  onInput={resizeTextarea}
                  className={cn(
                    'w-full rounded-xl rounded-b-none text-[16px]! leading-normal border-0! text-foreground! focus:ring-0! focus-visible:ring-0! min-h-0! px-4! py-3.5! touch-manipulation whatsize! shadow-none! transition-colors duration-200',
                    // Transparent so the rotating placeholder behind it shows.
                    showRotatingPlaceholder ? 'bg-transparent!' : 'bg-muted!',
                    isBusy && 'text-muted-foreground cursor-wait',
                  )}
                  style={textareaStyle}
                  rows={1}
                  autoFocus={!isBusy}
                  onCompositionStart={() => (isCompositionActive.current = true)}
                  onCompositionEnd={() => (isCompositionActive.current = false)}
                  onKeyDown={isBusy ? undefined : handleKeyDown}
                  onPaste={isBusy ? undefined : handlePaste}
                />
              )}

              {showRotatingPlaceholder && (
                <div className="absolute top-0 left-0 right-0 pointer-events-none z-10 px-4 py-[14px]">
                  <TextRotate
                    texts={['Ask anything...', 'Type @ for sources or / for modes']}
                    rotationInterval={3000}
                    splitBy="words"
                    staggerDuration={0.04}
                    staggerFrom="first"
                    transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                    mainClassName="text-[16px] leading-normal text-muted-foreground/90 font-sans"
                  />
                </div>
              )}

              <div
                className={cn(
                  'flex justify-between items-center rounded-t-none rounded-b-xl bg-muted! border-0! px-2.5 py-2 gap-2 shadow-none transition-all duration-200',
                  isBusy && 'pointer-events-none',
                  isRecording && 'text-muted-foreground!',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <PlusMenu
                    isMobile={isMobile}
                    open={plusMenuOpen}
                    onOpenChange={handlePlusMenuOpenChange}
                    options={modeOptions}
                    selectedGroup={selectedGroup}
                    isSignedIn={!!user}
                    showTemporaryToggle={!!user && !hasMessages}
                    isTemporaryChat={isTemporaryChat}
                    isTemporaryChatLocked={isTemporaryChatLocked}
                    // An Agent turn runs on the agent's own model, which reads PDFs with its
                    // own file tools whatever model is selected here.
                    uploadHint={
                      isHermesChat || selectedModelConfig?.pdf
                        ? 'Images, PDFs, CSV, Excel, Word'
                        : 'Images, CSV, Excel, Word'
                    }
                    onUpload={() => {
                      haptics.trigger('selection');
                      setPlusMenuOpen(false);
                      triggerFileInput();
                    }}
                    onToggleMode={handleModeToggle}
                    onToggleTemporary={() => {
                      toggleTemporaryChat();
                      setPlusMenuOpen(false);
                    }}
                    onContinueByVoice={
                      hasMessages &&
                      !isTemporaryChat &&
                      capabilities?.localVoice &&
                      (!isHermesChat || isHermesEnabled())
                        ? () => {
                            setPlusMenuOpen(false);
                            router.push(`/voice?chat=${chatId}`);
                          }
                        : undefined
                    }
                  />

                  {activeGroup && (
                    <ActiveModeBadge
                      group={activeGroup}
                      isLocked={isHermesLocked}
                      onSwitch={() => {
                        haptics.trigger('selection');
                        if (isMobile) setSelectedGroup('auto');
                        else setPlusMenuOpen(true);
                      }}
                      onClear={() => {
                        haptics.trigger('selection');
                        setSelectedGroup('auto');
                      }}
                    />
                  )}

                  {selectedGroup === 'mcp' && <McpServerSelector user={user} />}
                </div>

                <div className="flex items-center shrink-0 gap-1.5">
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          'rounded-full size-8! text-muted-foreground hover:text-foreground transition-colors',
                          isEnhancementActive && 'text-primary hover:text-primary',
                        )}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!isBusy) enhance();
                        }}
                        disabled={input.length === 0 || isBusy || uploadQueue.length > 0 || status !== 'ready'}
                      >
                        {isEnhancementActive ? (
                          <GripIcon ref={gripIconRef} size={16} className="text-primary" />
                        ) : (
                          <MagicEditIcon size={16} className="text-current" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      <span className="font-medium text-[11px]">
                        {isEnhancing ? 'Enhancing…' : isTypewriting ? 'Writing…' : 'Enhance prompt'}
                      </span>
                    </TooltipContent>
                  </Tooltip>

                  {/* Vision, reasoning effort and model configure a native turn; an Agent
                      turn never reaches /api/search and keeps its own model. */}
                  {selectedGroup !== 'hermes' && (
                    <>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'rounded-full size-8! text-muted-foreground hover:text-foreground transition-colors',
                              visionEnabled && 'text-primary hover:text-primary',
                            )}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onToggleVision();
                            }}
                          >
                            <Eye size={16} weight={visionEnabled ? 'fill' : 'regular'} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          <span className="font-medium text-[11px]">
                            {visionEnabled
                              ? 'Vision on — images are shown to the model'
                              : 'Vision off — images are attached but not shown to the model'}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                      <ReasoningEffortToggle
                        selectedModel={selectedModel}
                        value={reasoningEffort}
                        onChange={setReasoningEffort}
                      />
                      <ModelSwitcher
                        selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        status={status}
                        onModelSelect={(model) => setSelectedModel(model.value)}
                        autoRoutedModel={autoRoutedModel}
                        inputRef={inputRef}
                      />
                    </>
                  )}

                  {isProcessing ? (
                    <IconButtonTooltip label="Stop Generation">
                      <Button
                        variant="destructive"
                        size="icon"
                        className="rounded-full size-8! transition-colors"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!isBusy) stop();
                        }}
                        disabled={isBusy}
                      >
                        <StopIcon size={14} />
                      </Button>
                    </IconButtonTooltip>
                  ) : input.length === 0 && attachments.length === 0 && !isBusy ? (
                    <IconButtonTooltip label={isRecording ? 'Stop Recording' : 'Voice Input'}>
                      <Button
                        size="icon"
                        variant={isRecording ? 'destructive' : 'default'}
                        className="rounded-full size-8! transition-colors"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleRecord();
                        }}
                      >
                        <AudioLinesIcon ref={audioLinesRef} size={16} />
                      </Button>
                    </IconButtonTooltip>
                  ) : (
                    <IconButtonTooltip label="Send Message">
                      <Button
                        size="icon"
                        className="rounded-full size-8! transition-colors"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!isBusy) submitForm();
                        }}
                        disabled={uploadQueue.length > 0 || status !== 'ready' || isBusy}
                      >
                        <ArrowUpIcon size={16} />
                      </Button>
                    </IconButtonTooltip>
                  )}
                </div>
              </div>

              {showAutocomplete && (
                <AutocompleteList
                  suggestions={autocomplete.suggestions}
                  query={input}
                  highlightedIndex={autocomplete.highlightedIndex}
                  onHighlight={autocomplete.setHighlightedIndex}
                  onPick={pickSuggestion}
                />
              )}
            </div>
          </div>
        </div>

        {!hasMessages && <TemporaryChatNotice enabled={isTemporaryChatEnabled} reserveSpace={!!user} />}

        <VoiceSignInDialog open={showSignInDialog} onOpenChange={setShowSignInDialog} />
      </TooltipProvider>
    </div>
  );
};

export default memo(FormComponent);
