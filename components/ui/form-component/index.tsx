import React, { Fragment, memo, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sileo } from 'sileo';
import { useDebouncer } from '@tanstack/react-pacer';
import { Button } from '@/components/ui/button';
import { parseStartWithCommand } from '@/lib/chat-commands';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_MODEL_ALIAS, getAcceptedFileTypes, supportsCanvasMode } from '@/ai/models';
import { useModels } from '@/hooks/use-models';
import {
  X,
  Check,
  Upload,
  CheckIcon,
  Zap,
  Search,
  ChevronDown,
  Plus,
  Ghost,
  AlertCircle,
} from 'lucide-react';
import { MagicEditIcon } from '@/components/ui/magic-edit-icon';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';
import { cn, SearchGroup, SearchGroupId, getSearchGroups } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ComprehensiveUserData } from '@/hooks/use-user-data';
import { enhancePrompt, getHermesConnectorStatusAction } from '@/app/actions';
import { LockIcon, Eye, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { GlobalSearchIcon, DocumentAttachmentIcon } from '@hugeicons/core-free-icons';
import { AudioLinesIcon } from '@/components/ui/audio-lines';
import { GripIcon } from '@/components/ui/grip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Kbd } from '@/components/ui/kbd';
import { Checkbox } from '@/components/ui/checkbox';
import TextRotate from '@/components/ui/text-rotate';
import { AppsIcon } from '@/components/icons/apps-icon';
import { UseChatHelpers } from '@ai-sdk/react';
import { ChatMessage } from '@/lib/types';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { useInstanceCapabilities } from '@/hooks/use-instance-capabilities';
import { isSearchGroupAvailable, pickSearchProvider } from '@/lib/search/providers';
import { useSessionPreference } from '@/hooks/use-session-preference';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHermesSend } from '@/hooks/use-hermes-send';
import { filterHermesCommands, type HermesCommand } from '@/lib/hermes/commands';
import type { HermesChatLock } from '@/lib/hermes/chat-mode';
import { HERMES_MAX_ATTACHMENT_BYTES } from '@/lib/hermes/attachments';
import { isHermesEnabled } from '@/lib/hermes/enabled';
import { HermesCommandMenu } from './hermes-command-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebHaptics } from 'web-haptics/react';
import { ModelSwitcher } from './model-switcher';
import { FlexibleIcon } from '@/components/ui/flexible-icon';
import { ReasoningEffortToggle } from './reasoning-effort-toggle';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';
import { useModeAccentStyle, ModeAccentSpread } from '@/components/mode-accent';
import { McpServerSelector } from './mcp-server-selector';
import {
  type Attachment,
  MAX_FILES,
  MAX_INPUT_CHARS,
  ArrowUpIcon,
  StopIcon,
  AttachmentPreview,
} from './attachment-utils';
import { selectUploadableFiles, uploadFiles } from './upload-files';

interface TypewriterResumeCache {
  target: string;
  index: number;
  speed: number;
}

// Preserve in-progress prompt enhancement across transient remounts.
let pendingTypewriterResumeCache: TypewriterResumeCache | null = null;

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

// The 11 single-purpose search tools that are now always-on, filtered by the
// zetora-enabled-sources preference, instead of an exclusive mode you had to
// pick. Memory/Apps/Canvas stay exclusive per-message
// toggles (see VALID_SPECIAL_MODES) since they replace the whole tool set
// (or, for Canvas, the whole response pipeline) rather than just adding one.
const SOURCE_CATALOG_IDS = [
  'web',
  'x',
  'stocks',
  'code',
  'academic',
  'reddit',
  'github',
  'crypto',
  'prediction',
  'youtube',
  'spotify',
] as const;

const BASE_VALID_SPECIAL_MODES = new Set<string>([
  'auto',
  'mcp',
  'canvas',
  'deep-research',
  'extreme-search',
  'hermes',
]);

// Within the '/' trigger popup, these force an existing skill for a single
// message rather than swapping the whole pipeline for another agent —
// labeled as "Skills" instead of "Modes" so they don't read as equivalent.
const SKILL_MODE_IDS = new Set<string>(['deep-research', 'extreme-search']);

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
  const { models, getModel } = useModels();
  const selectedModelConfig = getModel(selectedModel);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);
  const canvasEnvEnabled = process.env.NEXT_PUBLIC_CANVAS_ENABLED === 'true';
  const mcpEnvEnabled = process.env.NEXT_PUBLIC_MCP_ENABLED === 'true';
  const hermesEnvEnabled = isHermesEnabled();
  // "Show this mode in the chat's + menu" — separate from any env-level
  // availability gate above; both must hold for the mode to be offered.
  const [appsEnabledPref] = useSyncedPreferences<boolean>('zetora-apps-enabled', true);
  const [canvasEnabledPref] = useSyncedPreferences<boolean>('zetora-canvas-enabled', true);
  // Gates the deep-research/extreme-search forced-mode entries below: a
  // disabled skill can't be forced. Same list Settings > Skills writes to.
  const [disabledSkillsPref] = useSyncedPreferences<string[]>('zetora-disabled-skills', []);
  const mcpEnabled = mcpEnvEnabled && appsEnabledPref;
  const canvasEnabled = canvasEnvEnabled && canvasEnabledPref;
  // Unlike the other modes above, this can't be a user preference toggle — it reflects
  // real server-side enrollment state (Settings > Hermes), not a show/hide choice.
  const { data: hermesConnectorStatus, isSuccess: isHermesConnectorStatusResolved } = useQuery({
    queryKey: ['hermesConnectorStatus', user?.id],
    queryFn: () => getHermesConnectorStatusAction(),
    enabled: !!user && hermesEnvEnabled,
    staleTime: 30_000,
  });
  const hermesEnabled = hermesEnvEnabled && hermesConnectorStatus?.connector?.status === 'enrolled';
  // Whether the CURRENT chat can still offer Agent mode as a choice — false once this
  // chat's first message already went through native Zetora search (see
  // resolveHermesChatLock for the full rule). Distinct from isHermesLocked below: this chat
  // could also be unlocked (brand new) or hermes-locked already.
  const hermesSelectableForChat = hermesEnabled && hermesChatLock !== 'search';
  // Whether this chat is committed to Agent mode — it can never leave it, so the
  // mode-switcher UI hides every affordance to do so. Includes a chat that became a Hermes
  // chat in this session, before any server-resolved lock exists for it.
  const isHermesLocked = isHermesChat;
  const sendHermesMessage = useHermesSend(chatId);
  const formQueryClient = useQueryClient();
  const isMounted = useRef(true);
  const isCompositionActive = useRef(false);
  const typewriterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTypewriterTargetRef = useRef<string | null>(null);
  const setInputRef = useRef(setInput);
  const latestInputRef = useRef(input);
  const typewriterSpeedRef = useRef(5);
  const postSubmitFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isTypewriting, setIsTypewriting] = useState(false);
  const [showSignInDialog, setShowSignInDialog] = useState(false);

  // Inline trigger popup state: '@' for sources, '/' for modes (extreme/canvas/apps)
  const [triggerPopup, setTriggerPopup] = useState<'@' | '/' | null>(null);
  const [triggerFilter, setTriggerFilter] = useState('');
  const [triggerHighlightIndex, setTriggerHighlightIndex] = useState(0);
  const triggerPopupScrollRef = useRef<HTMLDivElement>(null);

  // Autocomplete suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [plusMenuCanScroll, setPlusMenuCanScroll] = useState(true);
  const plusMenuScrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const haptics = useWebHaptics();

  useEffect(() => {
    setInputRef.current = setInput;
  }, [setInput]);

  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);

  const handlePlusMenuScroll = useCallback(() => {
    const el = plusMenuScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
    setPlusMenuCanScroll(!atBottom);
  }, []);

  const handlePlusMenuOpenChange = useCallback(
    (nextOpen: boolean) => {
      setPlusMenuOpen(nextOpen);
      if (nextOpen) haptics.trigger('light');
    },
    [haptics],
  );

  // Combined state for animations to avoid restart issues
  const isEnhancementActive = isEnhancing || isTypewriting;
  const audioLinesRef = useRef<any>(null);
  const gripIconRef = useRef<any>(null);

  const isProcessing = useMemo(() => status === 'submitted' || status === 'streaming', [status]);

  const modeAccentStyle = useModeAccentStyle(selectedGroup);

  // Search groups for the plus menu
  const [searchProviderPref] = useSyncedPreferences<string>('zetora-search-provider', '');
  const instanceCapabilities = useInstanceCapabilities();
  const availableSearchProviders = instanceCapabilities?.searchProviders;
  const dynamicSearchGroups = useMemo(
    () =>
      getSearchGroups(
        pickSearchProvider('web', searchProviderPref, availableSearchProviders ?? []) ?? undefined,
      ).filter((group) => isSearchGroupAvailable(group.id, availableSearchProviders)),
    [searchProviderPref, availableSearchProviders],
  );
  const [visibleModesOuter] = useSyncedPreferences<string[]>('zetora-visible-modes', []);
  const [modeOrderOuter] = useSyncedPreferences<string[]>('zetora-group-order', []);

  // Shared helper: sort groups by user-defined order (empty = default order)
  const applyModeOrder = useCallback(
    <T extends { id: string }>(groups: T[]): T[] => {
      if (!modeOrderOuter || modeOrderOuter.length === 0) return groups;
      const orderMap = new Map(modeOrderOuter.map((id, i) => [id, i]));
      return [...groups].sort((a, b) => {
        const ai = orderMap.get(a.id) ?? Infinity;
        const bi = orderMap.get(b.id) ?? Infinity;
        return ai - bi;
      });
    },
    [modeOrderOuter],
  );

  // Sources: always-on tools filtered by user preference, not a mode to pick.
  // An empty list falls back to the older zetora-visible-modes key. Owned by
  // Preferences > Customize; the chat picker below only reads it.
  const [enabledSourcesPref] = useSyncedPreferences<string[]>('zetora-enabled-sources', []);
  const globalEnabledSources =
    enabledSourcesPref.length > 0
      ? enabledSourcesPref
      : (visibleModesOuter ?? []).filter((id) => (SOURCE_CATALOG_IDS as readonly string[]).includes(id));
  const isGloballyEnabled = useCallback(
    (id: string) => globalEnabledSources.length === 0 || globalEnabledSources.includes(id),
    [globalEnabledSources],
  );
  // Session-only override: toggling a source off in the chat picker hides it
  // for this browser session (all chats, this browser) without touching the
  // account-wide preference above, so it never shows as disabled in Customize
  // and never disappears for other sessions/devices.
  // null = untouched this session (defer to the global preference); [] is a
  // distinct, explicit "user unchecked everything" state, not "unset" - so
  // clearing every source doesn't spring back to all-enabled on the next render.
  const [sessionEnabledSources, setSessionEnabledSources] = useSessionPreference<string[] | null>(
    'zetora-session-enabled-sources',
    null,
  );
  const isSourceEnabled = useCallback(
    (id: string) => isGloballyEnabled(id) && (sessionEnabledSources === null || sessionEnabledSources.includes(id)),
    [isGloballyEnabled, sessionEnabledSources],
  );
  const toggleSource = useCallback(
    (id: string) => {
      const base =
        sessionEnabledSources === null
          ? SOURCE_CATALOG_IDS.filter((sourceId) => isGloballyEnabled(sourceId))
          : sessionEnabledSources;
      const next = base.includes(id) ? base.filter((s) => s !== id) : [...base, id];
      setSessionEnabledSources(next);
    },
    [sessionEnabledSources, isGloballyEnabled, setSessionEnabledSources],
  );
  const enabledSourcesCount = SOURCE_CATALOG_IDS.filter((id) => isSourceEnabled(id)).length;
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  // Snapshot of which sources to list, taken when the submenu opens. Rows are
  // driven only by the account-wide Customize preference — sources hidden
  // there never make it into this snapshot — while the checkbox state (via
  // isSourceEnabled) also folds in the session-only override, so toggling a
  // checkbox *within* this open submenu never removes its own row out from
  // under the user's cursor. Only reopening the submenu (or Customize)
  // changes which rows are offered.
  const [visibleSourceIds, setVisibleSourceIds] = useState<string[]>([]);
  const handleToggleSourcesExpanded = useCallback(() => {
    setSourcesExpanded((prev) => {
      const next = !prev;
      if (next) {
        setVisibleSourceIds(SOURCE_CATALOG_IDS.filter((id) => isGloballyEnabled(id)));
      }
      return next;
    });
  }, [isGloballyEnabled]);

  // Reset scroll indicator when the menu opens, and re-measure whenever the
  // Sources submenu expands/collapses — its content is what plusMenuScrollRef
  // actually measures, so this must re-run on top of the plusMenuOpen check
  // below or the indicator keeps showing/hiding based on stale dimensions
  // from before the submenu changed size.
  useEffect(() => {
    if (plusMenuOpen) {
      setPlusMenuCanScroll(true);
      // Check after render if content is actually scrollable
      requestAnimationFrame(() => {
        const el = plusMenuScrollRef.current;
        if (el) {
          setPlusMenuCanScroll(el.scrollHeight > el.clientHeight);
        }
      });
    }
  }, [plusMenuOpen, sourcesExpanded]);

  // Base groups for @ trigger (all visible groups)
  const sourceGroups = useMemo(() => {
    let allVisible = dynamicSearchGroups.filter((group) => {
      if (!group.show) return false;
      if ('requireAuth' in group && group.requireAuth && !user) return false;
      if (group.id === 'extreme' || group.id === 'canvas' || group.id === 'mcp')
        return false;
      return true;
    });
    if (visibleModesOuter && visibleModesOuter.length > 0) {
      const modeSet = new Set(visibleModesOuter);
      allVisible = allVisible.filter((g) => modeSet.has(g.id));
    }
    return applyModeOrder(allVisible);
  }, [dynamicSearchGroups, visibleModesOuter, user, applyModeOrder]);

  // Base groups for / trigger (deep research, extreme search, apps, canvas)
  const modeGroups = useMemo(() => {
    // The old 'extreme' id stays permanently retired (folded into the
    // always-on extreme_search tool + the "Extreme Search" skill) and is
    // never offered here. 'extreme-search' below is an unrelated, new id:
    // forcing the dedicated extreme_search tool for one message, gated by
    // the zetora-disabled-skills preference rather than an env/account
    // toggle like the other modes in this list.
    const modeIds = new Set<string>();
    if (!disabledSkillsPref.includes('deep-research')) modeIds.add('deep-research');
    if (!disabledSkillsPref.includes('extreme-search')) modeIds.add('extreme-search');
    if (canvasEnabled) modeIds.add('canvas');
    if (mcpEnabled) modeIds.add('mcp');
    if (hermesSelectableForChat) modeIds.add('hermes');
    const filtered = dynamicSearchGroups.filter((group) => {
      if (!group.show) return false;
      if ('requireAuth' in group && group.requireAuth && !user) return false;
      return modeIds.has(group.id);
    });
    const order = ['deep-research', 'extreme-search', 'mcp', 'canvas', 'hermes'];
    return filtered.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [
    dynamicSearchGroups,
    canvasEnabled,
    mcpEnabled,
    hermesSelectableForChat,
    disabledSkillsPref,
    user,
  ]);

  // A stored group that isn't an exclusive special mode (an old value such as
  // 'web'), or a mode the user has since hidden, falls back to 'auto'.
  useEffect(() => {
    const isKnownMode = BASE_VALID_SPECIAL_MODES.has(selectedGroup);
    if (!isKnownMode) {
      setSelectedGroup('auto');
      return;
    }
    const isHiddenByPreference =
      (selectedGroup === 'canvas' && !canvasEnabled) ||
      (selectedGroup === 'mcp' && !mcpEnabled) ||
      (selectedGroup === 'deep-research' && disabledSkillsPref.includes('deep-research')) ||
      (selectedGroup === 'extreme-search' && disabledSkillsPref.includes('extreme-search')) ||
      // Writes a global, cross-chat preference from an async value, so it needs a positive
      // signal: the connector query must have answered (loading or errored reads as
      // "disabled"), and a chat locked to Agent mode must not rewrite every other chat's
      // preference. The other checks read synchronous state.
      (selectedGroup === 'hermes' &&
        !isHermesLocked &&
        isHermesConnectorStatusResolved &&
        !hermesSelectableForChat);
    if (isHiddenByPreference) setSelectedGroup('auto');
  }, [
    selectedGroup,
    setSelectedGroup,
    canvasEnabled,
    mcpEnabled,
    hermesSelectableForChat,
    isHermesConnectorStatusResolved,
    isHermesLocked,
    disabledSkillsPref,
  ]);

  // Native Hermes commands (/new, /model, ...) replace the mode-switcher popup entirely
  // while a Hermes chat is active — a command targets the already-active conversation,
  // it doesn't switch pipelines, so it gets its own menu rather than being bent into
  // SearchGroup's shape (no icon, no "Active" state).
  const isHermesCommandMenu = triggerPopup === '/' && selectedGroup === 'hermes';

  const hermesCommandItems = useMemo(
    () => (isHermesCommandMenu ? filterHermesCommands(triggerFilter) : []),
    [isHermesCommandMenu, triggerFilter],
  );

  // Active group list based on which trigger is open
  const triggerBaseGroups = triggerPopup === '/' ? modeGroups : sourceGroups;

  const filteredTriggerGroups = useMemo(() => {
    if (!triggerFilter) return triggerBaseGroups;
    const lower = triggerFilter.toLowerCase();
    return triggerBaseGroups.filter((g) => g.name.toLowerCase().includes(lower) || g.id.toLowerCase().includes(lower));
  }, [triggerBaseGroups, triggerFilter]);

  // Whether the temp/private toggle appears in the / trigger popup (only before chat starts)
  const showTempInTrigger = useMemo(() => {
    if (triggerPopup !== '/' || isHermesCommandMenu) return false;
    if (!user || hasMessages) return false;
    if (!triggerFilter) return true;
    const lower = triggerFilter.toLowerCase();
    return 'temporary'.includes(lower) || 'private'.includes(lower);
  }, [triggerPopup, isHermesCommandMenu, user, hasMessages, triggerFilter]);

  const triggerTotalItems = isHermesCommandMenu
    ? hermesCommandItems.length
    : filteredTriggerGroups.length + (showTempInTrigger ? 1 : 0);

  // Reset highlight when filter or trigger changes
  useEffect(() => {
    setTriggerHighlightIndex(0);
  }, [triggerFilter, triggerPopup]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (!triggerPopup) return;
    const container = triggerPopupScrollRef.current;
    if (!container) return;
    const item = container.querySelector(`[data-at-index="${triggerHighlightIndex}"]`);
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [triggerHighlightIndex, triggerPopup]);

  const cleanupMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
        typewriterTimeoutRef.current = null;
      }
      // Persist progress so a transient remount can resume smoothly.
      if (pendingTypewriterTargetRef.current) {
        const target = pendingTypewriterTargetRef.current;
        const typedLength = Math.min(target.length, Math.max(latestInputRef.current.length, 1));
        pendingTypewriterResumeCache = {
          target,
          index: typedLength,
          speed: typewriterSpeedRef.current,
        };
        pendingTypewriterTargetRef.current = null;
      }
      cleanupMediaRecorder();
    };
  }, [cleanupMediaRecorder]);

  // Control audio lines animation
  useEffect(() => {
    if (audioLinesRef.current) {
      if (isRecording) {
        audioLinesRef.current.startAnimation();
      } else {
        audioLinesRef.current.stopAnimation();
      }
    }
  }, [isRecording]);

  // Control grip icon animation using combined state to avoid restarts
  useEffect(() => {
    if (gripIconRef.current) {
      if (isEnhancementActive) {
        gripIconRef.current.startAnimation();
      } else {
        gripIconRef.current.stopAnimation();
      }
    }
  }, [isEnhancementActive]);

  // Global typing detection to auto-focus form
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Don't interfere if user is already typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      // Don't interfere with keyboard shortcuts (Ctrl/Cmd + key)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // Don't interfere with function keys, arrow keys, etc.
      if (
        event.key.length > 1 && // Multi-character keys like 'Enter', 'Escape', etc.
        !['Backspace', 'Delete', 'Space'].includes(event.key)
      ) {
        return;
      }

      // Don't focus if form is already focused
      if (inputRef.current && document.activeElement === inputRef.current) {
        return;
      }

      // Don't focus if recording is active
      if (isRecording) {
        return;
      }

      // Focus the input and add the typed character
      if (inputRef.current && event.key.length === 1) {
        inputRef.current.focus();
        // If it's a printable character, add it to the input
        if (event.key !== ' ' || input.length > 0) {
          // Allow space only if there's already content
          const newValue = input + event.key;
          setInput(newValue);
          event.preventDefault();

          // Check for @ or / trigger from global key handler
          if ((event.key === '@' || event.key === '/') && (input.length === 0 || /\s$/.test(input))) {
            setTriggerPopup(event.key as '@' | '/');
            setTriggerFilter('');
          }
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isRecording, input, setInput, inputRef]);

  // Typewriter effect for enhanced text
  const typewriterText = useCallback(
    (text: string, speed: number = 5, startIndex?: number) => {
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
        typewriterTimeoutRef.current = null;
      }
      typewriterSpeedRef.current = speed;
      pendingTypewriterTargetRef.current = text;
      if (!text || text.length === 0) {
        setIsTypewriting(false);
        pendingTypewriterTargetRef.current = null;
        pendingTypewriterResumeCache = null;
        return;
      }

      const initialIndex = Math.min(text.length, Math.max(startIndex ?? 1, 1));
      let currentIndex = initialIndex;

      setIsTypewriting(currentIndex < text.length);
      // Never start from an empty frame; this avoids "input reset to null" perception.
      setInputRef.current(text.slice(0, currentIndex));
      pendingTypewriterResumeCache = { target: text, index: currentIndex, speed };

      if (currentIndex >= text.length) {
        pendingTypewriterTargetRef.current = null;
        pendingTypewriterResumeCache = null;
        setIsTypewriting(false);
        inputRef.current?.focus();
        return;
      }

      const typeNextChar = () => {
        if (!isMounted.current) return;
        if (currentIndex < text.length) {
          currentIndex++;
          setInputRef.current(text.substring(0, currentIndex));
          pendingTypewriterResumeCache = { target: text, index: currentIndex, speed };
          typewriterTimeoutRef.current = setTimeout(typeNextChar, speed);
          return;
        }
        typewriterTimeoutRef.current = null;
        pendingTypewriterTargetRef.current = null;
        pendingTypewriterResumeCache = null;
        setIsTypewriting(false);
        inputRef.current?.focus();
      };

      typewriterTimeoutRef.current = setTimeout(typeNextChar, speed);
    },
    [inputRef],
  );

  // Resume in-progress typewriter after a transient remount.
  useEffect(() => {
    const pendingResume = pendingTypewriterResumeCache;
    if (!pendingResume) return;

    const currentInput = latestInputRef.current;
    if (!pendingResume.target.startsWith(currentInput)) {
      pendingTypewriterResumeCache = null;
      return;
    }

    pendingTypewriterResumeCache = null;
    const resumeIndex = Math.min(pendingResume.target.length, Math.max(pendingResume.index, currentInput.length, 1));

    typewriterText(pendingResume.target, pendingResume.speed, resumeIndex);
  }, [typewriterText]);

  const handleEnhance = useCallback(async () => {
    if (!input || input.trim().length === 0) {
      haptics.trigger('error');
      sileo.error({ title: 'Please enter a prompt to enhance' });
      return;
    }
    if (isProcessing || isEnhancing) return;

    const originalInput = input;
    setIsEnhancing(true);

    const enhanceAsync = async () => {
      const result = await enhancePrompt(input);
      if (result?.success && result.enhanced) {
        typewriterText(result.enhanced);
        setIsEnhancing(false);
        haptics.trigger('success');
        return result;
      }
      throw new Error(result?.error || 'Failed to enhance prompt');
    };

    sileo.promise(
      enhanceAsync().catch((e) => {
        setInput(originalInput);
        setIsEnhancing(false);
        haptics.trigger('error');
        throw e;
      }),
      {
        loading: { title: 'Enhancing your prompt...' },
        success: () => ({ title: 'Prompt enhanced successfully!' }),
        error: (err) => ({ title: (err as Error).message }),
      },
    );
  }, [input, haptics, isProcessing, setInput, typewriterText, isEnhancing]);

  const handleRecord = useCallback(async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      cleanupMediaRecorder();
      haptics.trigger('selection');
    } else {
      try {
        // Check if user is signed in
        if (!user) {
          haptics.trigger('warning');
          setShowSignInDialog(true);
          return;
        }

        // Environment and feature checks
        if (typeof window === 'undefined') {
          haptics.trigger('error');
          sileo.error({ title: 'Voice recording is only available in the browser.' });
          return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          haptics.trigger('error');
          sileo.error({ title: 'Voice recording is not supported in this browser.' });
          return;
        }

        // Best-effort permissions hint (not supported in all browsers)
        try {
          const permApi: any = (navigator as any).permissions;
          if (permApi?.query) {
            const status = await permApi.query({ name: 'microphone' as any });
            if (status?.state === 'denied') {
              haptics.trigger('error');
              sileo.error({ title: 'Microphone access is denied. Enable it in your browser settings.' });
              return;
            }
          }
        } catch {
          // Ignore permissions API errors; proceed to request directly
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Pick a supported MIME type to maximize cross-browser compatibility (e.g., Safari)
        const candidateMimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/mp4',
          'audio/ogg;codecs=opus',
          'audio/mpeg',
        ];
        const isTypeSupported = (type: string) =>
          typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported?.(type);
        const selectedMimeType = candidateMimeTypes.find((t) => isTypeSupported(t));

        let recorder: MediaRecorder;
        try {
          recorder = selectedMimeType
            ? new MediaRecorder(stream, { mimeType: selectedMimeType })
            : new MediaRecorder(stream);
        } catch (e) {
          // Fallback: try without options
          recorder = new MediaRecorder(stream);
        }
        mediaRecorderRef.current = recorder;

        recorder.addEventListener('dataavailable', async (event) => {
          if (event.data.size > 0) {
            const audioBlob = event.data;

            try {
              const formData = new FormData();
              const extension = (() => {
                const type = (audioBlob?.type || '').toLowerCase();
                if (type.includes('mp4')) return 'mp4';
                if (type.includes('ogg')) return 'ogg';
                if (type.includes('mpeg')) return 'mp3';
                return 'webm';
              })();
              formData.append('audio', audioBlob, `recording.${extension}`);
              const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
              });

              if (!response.ok) {
                throw new Error(`Transcription failed: ${response.statusText}`);
              }

              const data = await response.json();

              if (data.text) {
                setInput(data.text);
              } else {
                console.error('Transcription response did not contain text:', data);
              }
            } catch (error) {
              console.error('Error during transcription request:', error);
              haptics.trigger('error');
              sileo.error({ title: 'Failed to transcribe audio. Please try again.' });
            } finally {
              cleanupMediaRecorder();
            }
          }
        });

        recorder.addEventListener('error', (e) => {
          console.error('MediaRecorder error:', e);
          haptics.trigger('error');
          sileo.error({ title: 'Recording failed. Please try again or switch browser.' });
          cleanupMediaRecorder();
        });

        recorder.addEventListener('stop', () => {
          stream.getTracks().forEach((track) => track.stop());
        });

        recorder.start();
        setIsRecording(true);
        haptics.trigger('medium');
      } catch (error) {
        console.error('Error accessing microphone:', error);
        haptics.trigger('error');
        sileo.error({ title: 'Could not access microphone. Please allow mic permission.' });
        setIsRecording(false);
      }
    }
  }, [isRecording, cleanupMediaRecorder, setInput, user, setShowSignInDialog, haptics]);

  // Autocomplete: in-memory cache for instant repeat lookups
  const suggestCacheRef = useRef<Map<string, string[]>>(new Map());

  const fetchSuggestions = useCallback(
    async (query: string) => {
      const q = query.trim().toLowerCase();
      if (hasMessages || q.length < 1 || triggerPopup !== null) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      // Instant hit from memory cache
      const cached = suggestCacheRef.current.get(q);
      if (cached) {
        setSuggestions(cached);
        setSuggestionIndex(-1);
        setShowSuggestions(cached.length > 0);
        return;
      }

      // Abort any in-flight request
      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;

      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('suggest failed');
        const data = await res.json();
        const items: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        if (!controller.signal.aborted) {
          // Cache the result (cap at 200 entries to avoid memory leak)
          if (suggestCacheRef.current.size > 200) {
            const firstKey = suggestCacheRef.current.keys().next().value;
            if (firstKey) suggestCacheRef.current.delete(firstKey);
          }
          suggestCacheRef.current.set(q, items);
          setSuggestions(items);
          setSuggestionIndex(-1);
          setShowSuggestions(items.length > 0);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    },
    [hasMessages, triggerPopup],
  );

  const suggestDebouncer = useDebouncer(fetchSuggestions, { wait: 50, key: 'autocomplete' });

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      suggestAbortRef.current?.abort();
    };
  }, []);

  // Hide suggestions when messages appear (conversation started)
  useEffect(() => {
    if (hasMessages) {
      setSuggestions([]);
      setShowSuggestions(false);
      suggestAbortRef.current?.abort();
    }
  }, [hasMessages]);

  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      const newValue = event.target.value;
      const cursorPos = event.target.selectionStart ?? newValue.length;

      if (newValue.length > MAX_INPUT_CHARS) {
        setInput(newValue);
        sileo.error({ title: `Your input exceeds the maximum of ${MAX_INPUT_CHARS} characters.` });
      } else {
        setInput(newValue);
      }

      // Detect @ or / trigger for inline popup
      // Walk backwards from cursor to find an active trigger character
      let foundTrigger: '@' | '/' | null = null;
      let triggerPos = -1;
      for (let i = cursorPos - 1; i >= 0; i--) {
        if (newValue[i] === '@' || newValue[i] === '/') {
          // Trigger must be at start of input or preceded by whitespace
          if (i === 0 || /\s/.test(newValue[i - 1])) {
            foundTrigger = newValue[i] as '@' | '/';
            triggerPos = i;
          }
          break;
        }
        // Stop at whitespace — no trigger in this word
        if (/\s/.test(newValue[i])) break;
      }

      if (foundTrigger && triggerPos !== -1) {
        const filter = newValue.slice(triggerPos + 1, cursorPos);
        setTriggerFilter(filter);
        setTriggerPopup(foundTrigger);
        // Hide autocomplete when trigger popup is active
        setShowSuggestions(false);
      } else {
        setTriggerPopup(null);
        setTriggerFilter('');
        // Trigger autocomplete fetch (debounced)
        suggestDebouncer.maybeExecute(newValue);
      }
    },
    [setInput, suggestDebouncer],
  );

  const handleGroupSelect = useCallback(
    (group: SearchGroup) => {
      if (!isEnhancing && !isTypewriting) {
        // Re-selecting the already-active mode clears it back to auto instead of no-op'ing
        if (group.id === selectedGroup && group.id !== 'auto') {
          setSelectedGroup('auto');
          inputRef.current?.focus();
          return;
        }

        setSelectedGroup(group.id);

        // Auto-switch to canvas-supported model when canvas mode is selected
        if (group.id === 'canvas' && !supportsCanvasMode(selectedModelConfig)) {
          const defaultModel = getModel(DEFAULT_MODEL_ALIAS);
          const preferred = supportsCanvasMode(defaultModel) ? defaultModel : models.find(supportsCanvasMode);
          if (preferred) {
            setSelectedModel(preferred.value);
            sileo.info({
              title: `Switched to ${preferred.label} for canvas mode`,
              description: 'Model automatically changed for canvas mode',
              icon: <Zap className="h-4 w-4" />,
            });
          }
        }

        inputRef.current?.focus();
      }
    },
    [
      setSelectedGroup,
      selectedGroup,
      inputRef,
      isEnhancing,
      isTypewriting,
      selectedModelConfig,
      getModel,
      models,
      setSelectedModel,
    ],
  );

  // Handle trigger popup group selection: switch mode + strip the trigger text from input
  const handleTriggerSelect = useCallback(
    (group: SearchGroup) => {
      handleGroupSelect(group);

      // Strip the trigger text (@ or /) from input
      const trigger = triggerPopup;
      const textarea = inputRef.current;
      if (textarea && trigger) {
        const val = textarea.value;
        const cursorPos = textarea.selectionStart ?? val.length;
        // Walk backwards from cursor to find the trigger character
        let tPos = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
          if (val[i] === trigger) {
            tPos = i;
            break;
          }
          if (val[i] === ' ' || val[i] === '\n') break;
        }
        if (tPos !== -1) {
          const before = val.slice(0, tPos);
          const after = val.slice(cursorPos);
          const newVal = (before + after).trimStart();
          setInput(newVal);
          requestAnimationFrame(() => {
            if (inputRef.current) {
              const newPos = Math.min(tPos, newVal.length);
              inputRef.current.setSelectionRange(newPos, newPos);
              inputRef.current.focus();
            }
          });
        }
      }

      setTriggerPopup(null);
      setTriggerFilter('');
    },
    [handleGroupSelect, inputRef, setInput, triggerPopup],
  );

  // '/' mixes two different kinds of entries: skills (deep-research, extreme-search)
  // force an existing skill for one message, while modes (mcp,
  // canvas) swap the whole pipeline for another agent. Label them separately so they
  // don't read as equivalent. Extracted to a memo (rather than an inline IIFE in JSX) so
  // it sits alongside the render's other trigger-popup content, swapped out for the
  // Hermes command menu when isHermesCommandMenu is true.
  const modeListItems = useMemo(() => {
    // Skills always sort before modes (modeGroups's own `order`), so no running mutable
    // flag is needed — just the first index of each kind.
    const firstSkillIndex =
      triggerPopup === '/' ? filteredTriggerGroups.findIndex((g) => SKILL_MODE_IDS.has(g.id)) : -1;
    const firstModeIndex =
      triggerPopup === '/' ? filteredTriggerGroups.findIndex((g) => !SKILL_MODE_IDS.has(g.id)) : -1;
    return filteredTriggerGroups.map((group, index) => {
      const isHighlighted = index === triggerHighlightIndex;
      const isCurrentGroup = selectedGroup === group.id;
      const showSkillsHeader = index === firstSkillIndex;
      const showModesHeader = index === firstModeIndex;
      return (
        <Fragment key={group.id}>
          {showSkillsHeader && (
            <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
              Skills
            </p>
          )}
          {showModesHeader && (
            <>
              {firstSkillIndex !== -1 && <div className="my-1 mx-2 border-t border-border/30" />}
              <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                Modes
              </p>
            </>
          )}
          <button
            data-at-index={index}
            onMouseDown={(e) => {
              e.preventDefault();
              handleTriggerSelect(group);
            }}
            onMouseEnter={() => setTriggerHighlightIndex(index)}
            className={cn(
              'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-left transition-colors duration-100',
              isHighlighted ? 'bg-accent/80' : 'bg-transparent',
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center size-7 rounded-md shrink-0',
                isCurrentGroup ? 'bg-primary/10 text-primary' : 'bg-muted/80 text-muted-foreground',
              )}
            >
              <FlexibleIcon icon={group.icon} size={16} color="currentColor" strokeWidth={1.8} />
            </div>
            <span className="flex-1 text-[13px] font-medium text-foreground truncate">{group.name}</span>
            {isCurrentGroup && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-medium text-primary/70">Active</span>
                <CheckIcon className="size-3 text-primary" />
              </div>
            )}
          </button>
        </Fragment>
      );
    });
  }, [filteredTriggerGroups, triggerHighlightIndex, selectedGroup, triggerPopup, handleTriggerSelect]);

  // Inserts `/name ` at the trigger position — unlike handleTriggerSelect, this never
  // calls handleGroupSelect: a Hermes command targets the already-active conversation,
  // it doesn't switch pipelines.
  const handleHermesCommandSelect = useCallback(
    (command: HermesCommand) => {
      const textarea = inputRef.current;
      if (textarea) {
        const val = textarea.value;
        const cursorPos = textarea.selectionStart ?? val.length;
        let tPos = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
          if (val[i] === '/') {
            tPos = i;
            break;
          }
          if (val[i] === ' ' || val[i] === '\n') break;
        }
        if (tPos !== -1) {
          const before = val.slice(0, tPos);
          const after = val.slice(cursorPos);
          const insertion = `/${command.name} `;
          const newVal = before + insertion + after;
          setInput(newVal);
          requestAnimationFrame(() => {
            if (inputRef.current) {
              const newPos = tPos + insertion.length;
              inputRef.current.setSelectionRange(newPos, newPos);
              inputRef.current.focus();
            }
          });
        }
      }

      setTriggerPopup(null);
      setTriggerFilter('');
    },
    [inputRef, setInput],
  );

  // Handle temp/private toggle from / trigger popup
  const handleTriggerTempSelect = useCallback(() => {
    if (!isTemporaryChatLocked) {
      setIsTemporaryChatEnabled((prev: boolean) => !prev);
    }

    // Strip the trigger text (/) from input
    const trigger = triggerPopup;
    const textarea = inputRef.current;
    if (textarea && trigger) {
      const val = textarea.value;
      const cursorPos = textarea.selectionStart ?? val.length;
      let tPos = -1;
      for (let i = cursorPos - 1; i >= 0; i--) {
        if (val[i] === trigger) {
          tPos = i;
          break;
        }
        if (val[i] === ' ' || val[i] === '\n') break;
      }
      if (tPos !== -1) {
        const before = val.slice(0, tPos);
        const after = val.slice(cursorPos);
        const newVal = (before + after).trimStart();
        setInput(newVal);
        requestAnimationFrame(() => {
          if (inputRef.current) {
            const newPos = Math.min(tPos, newVal.length);
            inputRef.current.setSelectionRange(newPos, newPos);
            inputRef.current.focus();
          }
        });
      }
    }

    setTriggerPopup(null);
    setTriggerFilter('');
  }, [isTemporaryChatLocked, setIsTemporaryChatEnabled, triggerPopup, inputRef, setInput]);

  const handlePlusMenuGroupSelect = useCallback(
    (group: SearchGroup) => {
      haptics.trigger('selection');
      handleGroupSelect(group);
      setPlusMenuOpen(false);
    },
    [handleGroupSelect, haptics],
  );

  // Toggle one of the exclusive special modes (Memory/Canvas)
  // from the plus menu — click again to turn off and fall back to the base
  // Sources+Skills path, mirroring the existing Apps toggle row.
  const handleSpecialModeToggle = useCallback(
    async (modeId: string) => {
      const group = dynamicSearchGroups.find((g) => g.id === modeId);
      if (!group) return;

      if ('requireAuth' in group && group.requireAuth && !user) {
        haptics.trigger('warning');
        window.location.href = '/sign-in';
        setPlusMenuOpen(false);
        return;
      }

      if (selectedGroup === modeId) {
        haptics.trigger('selection');
        setSelectedGroup('auto');
        setPlusMenuOpen(false);
        return;
      }

      haptics.trigger('selection');
      handleGroupSelect(group);
      setPlusMenuOpen(false);
    },
    [dynamicSearchGroups, user, selectedGroup, setSelectedGroup, handleGroupSelect, haptics],
  );

  // Shared by the file picker, drop and paste.
  const attachFiles = useCallback(
    async (files: File[]) => {
      const uploadable = selectUploadableFiles(files, attachments.length);
      if (uploadable.length === 0) return;

      setUploadQueue(uploadable.map((file, i) => file.name || `Pasted Image ${i + 1}`));
      try {
        const uploaded = await uploadFiles(uploadable);
        if (uploaded.length > 0) {
          setAttachments((currentAttachments) => [...currentAttachments, ...uploaded]);
        }
      } finally {
        setUploadQueue([]);
      }
    },
    [attachments.length, setAttachments],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      try {
        await attachFiles(files);
      } finally {
        event.target.value = '';
      }
    },
    [attachFiles],
  );

  const removeAttachment = useCallback(
    async (index: number) => {
      // Get the attachment to delete
      const attachmentToDelete = attachments[index];

      // Delete from R2 storage if it's an uploaded file (has mplx/ in the path)
      if (attachmentToDelete?.url && attachmentToDelete.url.includes('/zetora/')) {
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: attachmentToDelete.url }),
          });
        } catch (error) {
          console.error('Failed to delete file from storage:', error);
          // Continue with local removal even if API call fails
        }
      }

      // Remove from state
      setAttachments((prev) => prev.filter((_, i) => i !== index));
    },
    [attachments, setAttachments],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (attachments.length >= MAX_FILES) return;

      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const hasFile = Array.from(e.dataTransfer.items).some((item) => item.kind === 'file');
        if (hasFile) {
          setIsDragging(true);
        }
      }
    },
    [attachments.length],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) {
        sileo.error({ title: 'No files detected in drop' });
        return;
      }
      await attachFiles(files);
    },
    [attachFiles],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return;

      e.preventDefault();
      await attachFiles(files);
    },
    [attachFiles],
  );

  useEffect(() => {
    if (status !== 'ready' && inputRef.current) {
      const focusTimeout = setTimeout(() => {
        if (isMounted.current && inputRef.current) {
          inputRef.current.focus({
            preventScroll: true,
          });
        }
      }, 300);

      return () => clearTimeout(focusTimeout);
    }
  }, [status, inputRef]);

  const updateChatUrl = useCallback(
    (chatIdToAdd: string) => {
      if (!user) {
        return;
      }
      const currentPath = window.location.pathname;
      if (currentPath === '/' || currentPath === '/new') {
        window.history.pushState({}, '', `/search/${chatIdToAdd}`);
      }
    },
    [user],
  );

  const executeSubmit = useCallback(() => {
    if (status !== 'ready') {
      haptics.trigger('warning');
      sileo.error({
        title: 'Please wait for the current response to complete',
        description: 'Wait for the current message to finish',
        icon: <AlertCircle className="h-4 w-4" />,
      });
      return;
    }

    if (isRecording) {
      haptics.trigger('warning');
      sileo.error({
        title: 'Please stop recording before submitting',
        description: 'Stop the voice recording first',
        icon: <AlertCircle className="h-4 w-4" />,
      });
      return;
    }

    if (input.length > MAX_INPUT_CHARS) {
      haptics.trigger('error');
      sileo.error({
        title: `Input exceeds ${MAX_INPUT_CHARS} characters`,
        description: 'Please shorten your message',
        icon: <AlertCircle className="h-4 w-4" />,
      });
      return;
    }

    if (selectedGroup === 'hermes') {
      const text = input.trim();
      if (!text && attachments.length === 0) {
        haptics.trigger('error');
        sileo.error({ title: 'Please enter a message or attach a file.' });
        return;
      }

      // Zetora's own upload accepts documents up to 50MB, but the Hermes gateway abandons
      // any download over 25MB (HERMES_MAX_ATTACHMENT_BYTES) — so a file in that band
      // would upload, preview, and never reach the agent. Refuse it by name instead.
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
      if (!isTemporaryChatEnabled) updateChatUrl(chatId);
      // This chat is a Hermes chat from now on. Said before the request goes out, not after:
      // /api/hermes/send creates the hermesConversation row that the server lock reads, but
      // this view never re-renders from the server again (updateChatUrl above is a
      // history.replaceState), so nothing else would ever tell it.
      onHermesMessageSent?.();

      // Never calls an LLM (see app/api/hermes/send/route.ts) — this bypasses
      // useChat's sendMessage/{/api/search} entirely. The user's own bubble is appended
      // optimistically here; the agent's reply arrives over the SSE channel
      // (hooks/use-hermes-stream.ts), same as every other mode's assistant message.
      const hermesAttachments = attachments.map((attachment) => ({
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType || attachment.mediaType || '',
      }));
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [
            ...hermesAttachments.map((a) => ({ type: 'file' as const, url: a.url, name: a.name, mediaType: a.mediaType })),
            { type: 'text', text },
          ],
        },
      ]);
      setInput('');
      setAttachments([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.overflowY = 'hidden';
      }

      sendHermesMessage(text, { attachments: hermesAttachments }).catch((error) => {
        haptics.trigger('error');
        sileo.error({
          title: 'Failed to send to Hermes',
          description: error instanceof Error ? error.message : 'Please try again',
          icon: <AlertCircle className="h-4 w-4" />,
        });
      });
      return;
    }

    if (selectedGroup === 'mcp') {
      const mcpCache = formQueryClient.getQueryData<{
        servers: Array<{ isEnabled: boolean; authType: string; isOAuthConnected: boolean }>;
      }>(['mcpServers', user?.id]);
      const hasEnabledApp = mcpCache?.servers?.some((s) => {
        const ready = s.authType !== 'oauth' || s.isOAuthConnected;
        return s.isEnabled && ready;
      });
      if (!hasEnabledApp) {
        haptics.trigger('warning');
        sileo.error({
          title: 'No apps enabled',
          description: 'Enable at least one app to use this mode',
          icon: <AlertCircle className="h-4 w-4" />,
        });
        return;
      }
    }

    if (input.trim() || attachments.length > 0) {
      haptics.trigger('medium');

      onBeforeSubmit?.();
      setHasSubmitted(true);
      lastSubmittedQueryRef.current = input.trim();

      // Keep URL in sync as soon as submit starts for authenticated users.
      if (!isTemporaryChatEnabled) {
        updateChatUrl(chatId);
      }

      // Send the message
      const { text: startWithStrippedInput, startWith } = parseStartWithCommand(input);
      sendMessage(
        {
          role: 'user',
          parts: [
            ...attachments.map((attachment) => ({
              type: 'file' as const,
              url: attachment.url,
              name: attachment.name,
              mediaType: attachment.contentType || attachment.mediaType || '',
            })),
            {
              type: 'text',
              text: startWith ? startWithStrippedInput : input,
            },
          ],
        },
        startWith ? { body: { startWith } } : undefined,
      );

      setInput('');
      // Immediately reset textarea height to avoid jank from debounced resize
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.overflowY = 'hidden';
      }
      setAttachments([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      resetSuggestedQuestions();

      // Clear autocomplete suggestions on submit
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestionIndex(-1);
      suggestAbortRef.current?.abort();

      // Handle iOS keyboard behavior differently
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        inputRef.current?.blur();
      } else {
        inputRef.current?.focus();
      }
    } else {
      haptics.trigger('error');
      sileo.error({ title: 'Please enter a search query or attach an image.' });
    }
  }, [
    haptics,
    status,
    isRecording,
    user,
    input,
    attachments,
    sendMessage,
    updateChatUrl,
    chatId,
    isTemporaryChatEnabled,
    setInput,
    setAttachments,
    fileInputRef,
    resetSuggestedQuestions,
    inputRef,
    setHasSubmitted,
    lastSubmittedQueryRef,
    formQueryClient,
    onBeforeSubmit,
    selectedGroup,
    setMessages,
    sendHermesMessage,
    onHermesMessageSent,
  ]);

  const submitForm = useCallback(() => executeSubmit(), [executeSubmit]);

  const triggerFileInput = useCallback(() => {
    if (attachments.length >= MAX_FILES) {
      sileo.error({ title: `You can only attach up to ${MAX_FILES} images.` });
      return;
    }

    if (status === 'ready') {
      postSubmitFileInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  }, [attachments.length, status, fileInputRef]);

  // ⌘U shortcut to upload files
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

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When autocomplete suggestions are showing, intercept navigation keys
      if (showSuggestions && suggestions.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSuggestionIndex((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (event.key === 'Enter' && !isCompositionActive.current && suggestionIndex >= 0) {
          event.preventDefault();
          setInput(suggestions[suggestionIndex]);
          setSuggestions([]);
          setShowSuggestions(false);
          setSuggestionIndex(-1);
          return;
        }
        if (event.key === 'Tab' && suggestionIndex >= 0) {
          event.preventDefault();
          setInput(suggestions[suggestionIndex]);
          setSuggestions([]);
          setShowSuggestions(false);
          setSuggestionIndex(-1);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setShowSuggestions(false);
          setSuggestionIndex(-1);
          return;
        }
      }

      // When trigger popup is open, intercept navigation keys
      if (triggerPopup && triggerTotalItems > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setTriggerHighlightIndex((prev) => (prev + 1) % triggerTotalItems);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setTriggerHighlightIndex((prev) => (prev - 1 + triggerTotalItems) % triggerTotalItems);
          return;
        }
        if (event.key === 'Enter' && !isCompositionActive.current) {
          event.preventDefault();
          if (isHermesCommandMenu) {
            if (hermesCommandItems[triggerHighlightIndex]) {
              handleHermesCommandSelect(hermesCommandItems[triggerHighlightIndex]);
            }
          } else if (triggerHighlightIndex < filteredTriggerGroups.length) {
            handleTriggerSelect(filteredTriggerGroups[triggerHighlightIndex]);
          } else if (showTempInTrigger && triggerHighlightIndex === filteredTriggerGroups.length) {
            handleTriggerTempSelect();
          }
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (isHermesCommandMenu) {
            if (hermesCommandItems[triggerHighlightIndex]) {
              handleHermesCommandSelect(hermesCommandItems[triggerHighlightIndex]);
            }
          } else if (triggerHighlightIndex < filteredTriggerGroups.length) {
            handleTriggerSelect(filteredTriggerGroups[triggerHighlightIndex]);
          } else if (showTempInTrigger && triggerHighlightIndex === filteredTriggerGroups.length) {
            handleTriggerTempSelect();
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setTriggerPopup(null);
          setTriggerFilter('');
          return;
        }
      }

      if (event.key === 'Enter' && !isCompositionActive.current) {
        if (isMobile) {
          // On mobile, allow Enter to create new lines only
          // Don't submit the form - users should use the send button
          // Just let the default behavior happen (newline insertion)
          return;
        } else {
          // Desktop behavior: Enter submits, Shift+Enter creates newline
          if (event.shiftKey) {
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          // Route Enter through submitForm so keyboard + button follow
          // the same debounced submit path.
          submitForm();
        }
      }
    },
    [
      submitForm,
      isMobile,
      triggerPopup,
      filteredTriggerGroups,
      triggerHighlightIndex,
      triggerTotalItems,
      showTempInTrigger,
      handleTriggerSelect,
      handleTriggerTempSelect,
      isHermesCommandMenu,
      hermesCommandItems,
      handleHermesCommandSelect,
      showSuggestions,
      suggestions,
      suggestionIndex,
      setInput,
    ],
  );

  const resizeTextarea = useCallback(() => {
    if (!inputRef.current) return;

    const target = inputRef.current;
    const maxHeight = 300;

    // Save scroll positions so the "height = auto" collapse doesn't cause a
    // visible page jump while the browser recalculates layout.
    const prevWindowScroll = window.scrollY;
    const prevTextareaScroll = target.scrollTop;

    target.style.height = 'auto';

    const scrollHeight = target.scrollHeight;

    if (scrollHeight > maxHeight) {
      target.style.height = `${maxHeight}px`;
      target.style.overflowY = 'auto';
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = 'hidden';
    }

    // Restore positions that may have shifted during the collapse.
    window.scrollTo({ top: prevWindowScroll });
    target.scrollTop = prevTextareaScroll;

    // Keep the cursor visible when typing at the end of a long prompt.
    if (target.selectionStart === target.value.length) {
      target.scrollTop = target.scrollHeight;
    }
  }, [inputRef]);

  // Resize textarea when input value changes using rAF for immediate visual response
  const resizeRafRef = useRef<number>(0);
  useEffect(() => {
    cancelAnimationFrame(resizeRafRef.current);
    resizeRafRef.current = requestAnimationFrame(resizeTextarea);
    return () => cancelAnimationFrame(resizeRafRef.current);
  }, [input, resizeTextarea]);

  // Handle cursor positioning: move to end if cursor is at start when textarea has value
  // This handles both initial mount (from localStorage) and external value changes (example selection)
  const handleTextareaFocus = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const textarea = e.target;
      if (textarea.value.length > 0 && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
        // Cursor is at start, move it to end
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      }
      // Re-show suggestions on focus if we have them
      if (suggestions.length > 0 && !hasMessages) {
        setShowSuggestions(true);
      }
    },
    [suggestions.length, hasMessages],
  );

  const handleTextareaBlur = useCallback(() => {
    // Delay hiding to allow click-through on suggestion items (onMouseDown fires before blur)
    setTimeout(() => {
      setShowSuggestions(false);
    }, 150);
  }, []);

  return (
    <div className={cn('flex flex-col w-full max-w-2xl mx-auto')}>
      <TooltipProvider>
        <div
          data-no-haptics
          className={cn(
            'relative w-full flex flex-col gap-1 rounded-xl transition-all duration-300 font-sans!',
            hasMessages ? 'z-50' : 'z-10',
            isDragging && 'ring-1 ring-border',
            attachments.length > 0 || uploadQueue.length > 0
              ? 'bg-primary/5 border border-ring/20 backdrop-blur-md! p-1 shadow-none!'
              : 'bg-transparent',
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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

          {(attachments.length > 0 || uploadQueue.length > 0) && (
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
                  attachment={
                    {
                      url: '',
                      name: filename,
                      contentType: '',
                      size: 0,
                    } as Attachment
                  }
                  onRemove={() => {}}
                  isUploading={true}
                />
              ))}
            </div>
          )}

          {/* Form container */}
          <div className="relative" data-form-container>
            {triggerPopup && triggerTotalItems > 0 && (
              <div
                className="absolute left-0 w-[280px] rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-none overflow-hidden z-100"
                style={{
                  ...(typeof window !== 'undefined' &&
                    (() => {
                      const el = document.querySelector('[data-form-container]');
                      if (!el) return { bottom: '100%', marginBottom: 8 };
                      const rect = el.getBoundingClientRect();
                      return rect.top > window.innerHeight / 2
                        ? { bottom: '100%', marginBottom: 8 }
                        : { top: '100%', marginTop: 8 };
                    })()),
                }}
              >
                {triggerPopup !== '/' && (
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                      Sources
                    </p>
                  </div>
                )}
                {isHermesCommandMenu && (
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                      Commands
                    </p>
                  </div>
                )}
                <div ref={triggerPopupScrollRef} className="px-1 pb-1 max-h-[260px] overflow-y-auto scrollbar-thin">
                  {isHermesCommandMenu ? (
                    <HermesCommandMenu
                      commands={hermesCommandItems}
                      highlightIndex={triggerHighlightIndex}
                      onSelect={handleHermesCommandSelect}
                      onHighlight={setTriggerHighlightIndex}
                    />
                  ) : (
                    modeListItems
                  )}
                  {showTempInTrigger && (
                    <>
                      {showTempInTrigger && (
                        <>
                          {filteredTriggerGroups.length > 0 && (
                            <div className="my-1 mx-2 border-t border-border/30" />
                          )}
                          <button
                            data-at-index={filteredTriggerGroups.length}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleTriggerTempSelect();
                            }}
                            onMouseEnter={() => setTriggerHighlightIndex(filteredTriggerGroups.length)}
                            className={cn(
                              'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-left transition-colors duration-100',
                              triggerHighlightIndex === filteredTriggerGroups.length
                                ? 'bg-accent/80'
                                : 'bg-transparent',
                            )}
                            disabled={isTemporaryChatLocked}
                          >
                            <div
                              className={cn(
                                'flex items-center justify-center size-7 rounded-md shrink-0',
                                isTemporaryChat ? 'bg-primary/10 text-primary' : 'bg-muted/80 text-muted-foreground',
                              )}
                            >
                              <Ghost size={16} strokeWidth={1.8} />
                            </div>
                            <span className="flex-1 text-[13px] font-medium text-foreground truncate">
                              {isTemporaryChat ? 'Temporary' : 'Private'}
                            </span>
                            {isTemporaryChat && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-medium text-primary/70">Active</span>
                                <CheckIcon className="size-3 text-primary" />
                              </div>
                            )}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Shadow-like background blur effect */}
            <div className="absolute -inset-1 rounded-2xl bg-primary/3 dark:bg-primary/3 blur-sm! pointer-events-none z-9999 shadow" />
            <div
              className={cn(
                'relative rounded-xl bg-muted! border border-ring/10 focus-within:border-ring/5 transition-colors duration-200',
                (isEnhancing || isTypewriting) && 'bg-muted!',
                showSuggestions &&
                  suggestions.length > 0 &&
                  !hasMessages &&
                  !triggerPopup &&
                  attachments.length === 0 &&
                  uploadQueue.length === 0 &&
                  'rounded-b-none border-b-transparent',
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
                  className={cn(
                    'w-full rounded-xl rounded-b-none md:text-base!',
                    'text-base leading-relaxed',
                    'bg-muted!',
                    'border-0!',
                    'text-muted-foreground!',
                    'focus:ring-0! focus-visible:ring-0!',
                    'min-h-0!',
                    'px-4! py-3.5!',
                    'touch-manipulation',
                    'whatsize!',
                    'text-center',
                    'cursor-not-allowed',
                    'shadow-none!',
                  )}
                  style={{
                    WebkitUserSelect: 'text',
                    WebkitTouchCallout: 'none',
                    minHeight: undefined,
                    resize: 'none',
                  }}
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
                          : '' // rotating overlay handles the empty home state
                  }
                  value={input}
                  onChange={handleInput}
                  onFocus={handleTextareaFocus}
                  onBlur={handleTextareaBlur}
                  disabled={isEnhancing || isTypewriting}
                  onInput={resizeTextarea}
                  className={cn(
                    'w-full rounded-xl rounded-b-none text-[16px]!',
                    'leading-normal',
                    'border-0!',
                    'text-foreground!',
                    'focus:ring-0! focus-visible:ring-0!',
                    'min-h-0!',
                    'px-4! py-3.5!',
                    'touch-manipulation',
                    'whatsize!',
                    'shadow-none!',
                    'transition-colors duration-200',
                    // transparent when overlay is active so TextRotate shows through
                    !input && !hasMessages && !isEnhancing && !isTypewriting && !isRecording
                      ? 'bg-transparent!'
                      : 'bg-muted!',
                    (isEnhancing || isTypewriting) && 'text-muted-foreground cursor-wait',
                  )}
                  style={{
                    WebkitUserSelect: 'text',
                    WebkitTouchCallout: 'none',
                    minHeight: undefined,
                    resize: 'none',
                  }}
                  rows={1}
                  autoFocus={!isEnhancing && !isTypewriting}
                  onCompositionStart={() => (isCompositionActive.current = true)}
                  onCompositionEnd={() => (isCompositionActive.current = false)}
                  onKeyDown={isEnhancing || isTypewriting ? undefined : handleKeyDown}
                  onPaste={isEnhancing || isTypewriting ? undefined : handlePaste}
                />
              )}

              {/* Rotating placeholder overlay — after textarea in DOM so it stacks on top */}
              {!isRecording && !input && !isEnhancing && !isTypewriting && !hasMessages && (
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
                  'flex justify-between items-center rounded-t-none rounded-b-xl',
                  'bg-muted!',
                  'border-0!',
                  'px-2.5 py-2 gap-2 shadow-none',
                  'transition-all duration-200',
                  (isEnhancing || isTypewriting) && 'pointer-events-none',
                  isRecording && 'bg-muted! text-muted-foreground!',
                )}
              >
                {/* Left: Plus menu button + mode selectors */}
                <div className="flex items-center gap-1.5">
                  {isMobile ? (
                    <Drawer open={plusMenuOpen} onOpenChange={handlePlusMenuOpenChange}>
                      <DrawerTrigger asChild>
                        <button
                          className={cn(
                            'flex items-center justify-center size-8 rounded-full',
                            'border border-foreground/25 text-foreground/70 bg-foreground/12',
                            'hover:bg-foreground/18 hover:text-foreground hover:border-foreground/35 transition-colors',
                            plusMenuOpen && 'bg-foreground/18 text-foreground border-foreground/35',
                          )}
                          aria-label="More options"
                        >
                          <Plus className="size-[18px]" strokeWidth={2} />
                        </button>
                      </DrawerTrigger>
                      <DrawerContent className="max-h-[70vh]">
                        <DrawerHeader className="text-left pb-1">
                          <DrawerTitle className="text-sm">Options</DrawerTitle>
                        </DrawerHeader>
                        <div className="px-1 pb-4 max-h-[calc(70vh-80px)] overflow-y-auto">
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors"
                            onClick={() => {
                              haptics.trigger('selection');
                              setPlusMenuOpen(false);
                              triggerFileInput();
                            }}
                          >
                            <HugeiconsIcon
                              icon={DocumentAttachmentIcon}
                              size={16}
                              color="currentColor"
                              strokeWidth={1.5}
                            />
                            <span className="flex-1 text-[13px]">Upload files or images</span>
                          </button>

                          {user && mcpEnabled && (
                            <button
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors',
                                selectedGroup === 'mcp' && 'bg-accent',
                              )}
                              onClick={() => {
                                const g = dynamicSearchGroups.find((g) => g.id === 'mcp');
                                if (g) handlePlusMenuGroupSelect(g);
                              }}
                            >
                              <AppsIcon width={16} height={16} />
                              <span className="flex-1 text-[13px]">Apps</span>
                              {selectedGroup === 'mcp' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                  Active
                                </span>
                              )}
                            </button>
                          )}
                          {user && canvasEnabled && (
                            <button
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors',
                                selectedGroup === 'canvas' && 'bg-accent',
                              )}
                              onClick={() => handleSpecialModeToggle('canvas')}
                            >
                              <FlexibleIcon
                                icon={dynamicSearchGroups.find((g) => g.id === 'canvas')!.icon}
                                size={16}
                                color="currentColor"
                                strokeWidth={1.5}
                              />
                              <span className="flex-1 text-[13px]">Canvas</span>
                              {selectedGroup === 'canvas' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                  Active
                                </span>
                              )}
                            </button>
                          )}
                          {user && hermesSelectableForChat && (
                            <button
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors',
                                selectedGroup === 'hermes' && 'bg-accent',
                              )}
                              onClick={() => handleSpecialModeToggle('hermes')}
                            >
                              <FlexibleIcon
                                icon={dynamicSearchGroups.find((g) => g.id === 'hermes')!.icon}
                                size={16}
                                color="currentColor"
                                strokeWidth={1.5}
                              />
                              <span className="flex-1 text-[13px]">Agent</span>
                              {selectedGroup === 'hermes' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                  Active
                                </span>
                              )}
                            </button>
                          )}
                          {/* {(input.length > 0 || isEnhancing || isTypewriting) && (
                            <button className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors', isEnhancementActive && 'bg-accent')} onClick={() => { if (!isEnhancing && !isTypewriting) handleEnhance(); setPlusMenuOpen(false); }} disabled={isEnhancing || isTypewriting || uploadQueue.length > 0 || status !== 'ready' || isLimitBlocked}>
                              {isEnhancementActive ? <GripIcon ref={gripIconRef} size={16} className="text-primary" /> : <Wand2 className="size-4 text-muted-foreground" />}
                              <span className="flex-1 text-[13px]">{isEnhancing ? 'Enhancing…' : isTypewriting ? 'Writing…' : 'Enhance prompt'}</span>
                            </button>
                          )} */}
                          {user && !hasMessages && (
                            <button
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors',
                                isTemporaryChat && 'bg-accent',
                              )}
                              onClick={() => {
                                if (!isTemporaryChatLocked) {
                                  setIsTemporaryChatEnabled((prev: boolean) => !prev);
                                }
                                setPlusMenuOpen(false);
                              }}
                              disabled={isTemporaryChatLocked}
                            >
                              <Ghost
                                size={16}
                                className={cn('shrink-0', isTemporaryChat ? 'text-primary' : 'text-muted-foreground')}
                                strokeWidth={1.5}
                              />
                              <span className="flex-1 text-[13px]">{isTemporaryChat ? 'Temporary' : 'Private'}</span>
                              {isTemporaryChat && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                  Active
                                </span>
                              )}
                              <span className="text-[9px] text-muted-foreground ml-auto hidden sm:block">⌘⇧J</span>
                            </button>
                          )}
                          <div className="my-1 mx-2 border-t border-border/40" />
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent transition-colors"
                            onClick={handleToggleSourcesExpanded}
                          >
                            <HugeiconsIcon icon={GlobalSearchIcon} size={16} color="currentColor" strokeWidth={1.5} />
                            <span className="flex-1 text-[13px]">Sources</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                              {enabledSourcesCount}
                            </span>
                            <ChevronDown
                              className={cn(
                                'size-3.5 text-muted-foreground transition-transform',
                                sourcesExpanded && 'rotate-180',
                              )}
                            />
                          </button>
                          {sourcesExpanded && (
                            <div className="pl-3 pr-1 py-1 space-y-0.5 max-h-56 overflow-y-auto">
                              {visibleSourceIds.map((id) => {
                                const group = dynamicSearchGroups.find((g) => g.id === id);
                                if (!group) return null;
                                return (
                                  <label
                                    key={id}
                                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                                  >
                                    <FlexibleIcon icon={group.icon} size={14} color="currentColor" strokeWidth={1.5} />
                                    <span className="flex-1 text-[12px]">{group.name}</span>
                                    <Checkbox checked={isSourceEnabled(id)} onCheckedChange={() => toggleSource(id)} />
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </DrawerContent>
                    </Drawer>
                  ) : (
                    <Popover open={plusMenuOpen} onOpenChange={handlePlusMenuOpenChange}>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                'flex items-center justify-center size-8 rounded-full',
                                'border border-foreground/25 text-foreground/70 bg-foreground/12',
                                'hover:bg-foreground/18 hover:text-foreground hover:border-foreground/35 transition-colors',
                                plusMenuOpen && 'bg-foreground/18 text-foreground border-foreground/35',
                              )}
                              aria-label="More options"
                            >
                              <Plus className="size-[18px]" strokeWidth={2} />
                            </button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        {!plusMenuOpen && (
                          <TooltipContent
                            side="bottom"
                            sideOffset={6}
                            className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!"
                          >
                            <span className="font-medium text-[11px]">Modes, uploads & more</span>
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <PopoverContent
                        className="w-64 p-1 font-sans rounded-lg bg-popover border shadow-lg"
                        align="start"
                        side="bottom"
                        sideOffset={4}
                      >
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <button
                              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors"
                              onClick={() => {
                                haptics.trigger('selection');
                                setPlusMenuOpen(false);
                                triggerFileInput();
                              }}
                            >
                              <HugeiconsIcon
                                icon={DocumentAttachmentIcon}
                                size={16}
                                color="currentColor"
                                strokeWidth={1.5}
                              />
                              <span className="flex-1 text-[13px]">Upload files or images</span>
                              <Kbd className="text-[9px] h-4 min-w-4 px-1">⌘U</Kbd>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8} className="max-w-48 py-1.5 px-2.5">
                            <span className="text-[10px] leading-snug">
                              {/* selectedModel says nothing about an Agent chat: a Hermes turn
                                  runs on the agent's own model and reads documents with its own
                                  file tools, so PDFs are always in. */}
                              {isHermesChat || selectedModelConfig?.pdf
                                ? 'Images, PDFs, CSV, Excel, Word'
                                : 'Images, CSV, Excel, Word'}
                            </span>
                          </TooltipContent>
                        </Tooltip>

                        {user && mcpEnabled && (
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors',
                                  selectedGroup === 'mcp' && 'bg-accent',
                                )}
                                onClick={() => {
                                  const g = dynamicSearchGroups.find((g) => g.id === 'mcp');
                                  if (g) handlePlusMenuGroupSelect(g);
                                }}
                              >
                                <AppsIcon width={16} height={16} />
                                <span className="flex-1 text-[13px]">Apps</span>
                                {selectedGroup === 'mcp' && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    Active
                                  </span>
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={8} className="max-w-48 py-1.5 px-2.5">
                              <span className="text-[10px] leading-snug">Use tools from your connected apps</span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {user && canvasEnabled && (
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors',
                                  selectedGroup === 'canvas' && 'bg-accent',
                                )}
                                onClick={() => handleSpecialModeToggle('canvas')}
                              >
                                <FlexibleIcon
                                  icon={dynamicSearchGroups.find((g) => g.id === 'canvas')!.icon}
                                  size={16}
                                  color="currentColor"
                                  strokeWidth={1.5}
                                />
                                <span className="flex-1 text-[13px]">Canvas</span>
                                {selectedGroup === 'canvas' && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    Active
                                  </span>
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={8} className="max-w-48 py-1.5 px-2.5">
                              <span className="text-[10px] leading-snug">
                                Research and generate interactive dashboards
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {user && hermesSelectableForChat && (
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors',
                                  selectedGroup === 'hermes' && 'bg-accent',
                                )}
                                onClick={() => handleSpecialModeToggle('hermes')}
                              >
                                <FlexibleIcon
                                  icon={dynamicSearchGroups.find((g) => g.id === 'hermes')!.icon}
                                  size={16}
                                  color="currentColor"
                                  strokeWidth={1.5}
                                />
                                <span className="flex-1 text-[13px]">Agent</span>
                                {selectedGroup === 'hermes' && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    Active
                                  </span>
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={8} className="max-w-48 py-1.5 px-2.5">
                              <span className="text-[10px] leading-snug">Talk to your own Hermes Agent</span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* {(input.length > 0 || isEnhancing || isTypewriting) && (
                          <button className={cn('w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors', isEnhancementActive && 'bg-accent')} onClick={() => { if (!isEnhancing && !isTypewriting) handleEnhance(); setPlusMenuOpen(false); }} disabled={isEnhancing || isTypewriting || uploadQueue.length > 0 || status !== 'ready' || isLimitBlocked}>
                            {isEnhancementActive ? <GripIcon ref={gripIconRef} size={16} className="text-primary" /> : <Wand2 className="size-4 text-muted-foreground" />}
                            <span className="flex-1 text-[13px]">{isEnhancing ? 'Enhancing…' : isTypewriting ? 'Writing…' : 'Enhance prompt'}</span>
                          </button>
                        )} */}
                        {user && !hasMessages && (
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <button
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors',
                                  isTemporaryChat && 'bg-accent',
                                )}
                                onClick={() => {
                                  if (!isTemporaryChatLocked) {
                                    setIsTemporaryChatEnabled((prev: boolean) => !prev);
                                  }
                                  setPlusMenuOpen(false);
                                }}
                                disabled={isTemporaryChatLocked}
                              >
                                <Ghost
                                  size={16}
                                  className={cn('shrink-0', isTemporaryChat ? 'text-primary' : 'text-muted-foreground')}
                                  strokeWidth={1.5}
                                />
                                <span className="flex-1 text-[13px]">{isTemporaryChat ? 'Temporary' : 'Private'}</span>
                                {isTemporaryChat && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    Active
                                  </span>
                                )}
                                <Kbd className="text-[9px] h-4 min-w-4 px-1">⌘⇧J</Kbd>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={8} className="max-w-48 py-1.5 px-2.5">
                              <span className="text-[10px] leading-snug">
                                {isTemporaryChat
                                  ? "This session won't be saved to history"
                                  : 'Toggle to prevent this session from being saved'}
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <div className="my-0.5 mx-2 border-t border-border/40" />
                        <button
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors"
                          onClick={handleToggleSourcesExpanded}
                        >
                          <HugeiconsIcon icon={GlobalSearchIcon} size={16} color="currentColor" strokeWidth={1.5} />
                          <span className="flex-1 text-[13px]">Sources</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                            {enabledSourcesCount}
                          </span>
                          <ChevronDown
                            className={cn(
                              'size-3.5 text-muted-foreground transition-transform',
                              sourcesExpanded && 'rotate-180',
                            )}
                          />
                        </button>
                        {sourcesExpanded && (
                          <div className="relative">
                            <div
                              ref={plusMenuScrollRef}
                              onScroll={handlePlusMenuScroll}
                              className="max-h-32 overflow-y-auto pl-2"
                            >
                              {visibleSourceIds.map((id) => {
                                const group = dynamicSearchGroups.find((g) => g.id === id);
                                if (!group) return null;
                                return (
                                  <label
                                    key={id}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer"
                                  >
                                    <FlexibleIcon icon={group.icon} size={14} color="currentColor" strokeWidth={1.5} />
                                    <span className="flex-1 text-[13px]">{group.name}</span>
                                    <Checkbox checked={isSourceEnabled(id)} onCheckedChange={() => toggleSource(id)} />
                                  </label>
                                );
                              })}
                            </div>
                            {plusMenuCanScroll && (
                              <div className="pointer-events-none absolute bottom-0 inset-x-0 flex justify-center pb-0.5 pt-4 bg-linear-to-t from-popover via-popover/80 to-transparent rounded-b-lg">
                                <ChevronDown className="size-3.5 text-muted-foreground animate-bounce" />
                              </div>
                            )}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* Active mode badge */}
                  {(() => {
                    const activeGroup = dynamicSearchGroups.find((g) => g.id === selectedGroup);
                    if (!activeGroup || selectedGroup === 'auto' || selectedGroup === 'mcp') return null;
                    // Once a chat's first message went through Agent mode, it can never
                    // leave — no clear button, no click-to-switch (see getHermesChatLock's
                    // own comment for the full rule).
                    return (
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'group relative flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-primary/8! text-primary/80 border border-primary/15 text-[12px] font-medium hover:bg-primary/12 hover:text-primary transition-colors',
                              isHermesLocked ? 'cursor-default' : 'cursor-pointer',
                            )}
                            onClick={() => {
                              if (isHermesLocked) return;
                              haptics.trigger('selection');
                              if (isMobile) {
                                setSelectedGroup('auto');
                                return;
                              }
                              setPlusMenuOpen(true);
                            }}
                          >
                            <div className="relative size-3.5">
                              <FlexibleIcon
                                icon={activeGroup.icon}
                                size={14}
                                color="currentColor"
                                strokeWidth={1.5}
                                className={cn(
                                  'absolute inset-0 transition-opacity',
                                  !isHermesLocked && 'group-hover:opacity-0',
                                )}
                              />
                              {!isHermesLocked && (
                                <button
                                  className="absolute -inset-0.5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-foreground/10 transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    haptics.trigger('selection');
                                    setSelectedGroup('auto');
                                  }}
                                  aria-label="Clear mode"
                                >
                                  <X className="size-3.5" strokeWidth={2} />
                                </button>
                              )}
                            </div>
                            <span>{activeGroup.name === 'Extreme' ? 'Extreme Agent' : activeGroup.name}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={6}
                          className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-[11px]">
                              {isHermesLocked ? 'Locked to this conversation' : 'Click to switch mode'}
                            </span>
                            {!isHermesLocked && <span className="text-[10px] text-background/50">Hover ✕ to clear</span>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })()}

                  {/* Inline MCP server selector when MCP mode is active */}
                  {selectedGroup === 'mcp' && <McpServerSelector user={user} />}
                </div>

                {/* Right: Enhance, Model selector, voice/send */}
                <div className="flex items-center shrink-0 gap-1.5">
                  {/* Enhance prompt button */}
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
                          if (!isEnhancing && !isTypewriting) handleEnhance();
                        }}
                        disabled={
                          input.length === 0 ||
                          isEnhancing ||
                          isTypewriting ||
                          uploadQueue.length > 0 ||
                          status !== 'ready'
                        }
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

                  {/* Vision/reasoning-effort/model are all Zetora-native LLM turn config —
                      a Hermes turn never reaches /api/search, so none of them do anything
                      in Agent mode (Hermes keeps its own independent model via /model). */}
                  {selectedGroup !== 'hermes' && (
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
                  )}

                  {selectedGroup !== 'hermes' && (
                    <ReasoningEffortToggle
                      selectedModel={selectedModel}
                      value={reasoningEffort}
                      onChange={setReasoningEffort}
                    />
                  )}

                  {selectedGroup !== 'hermes' && (
                    <ModelSwitcher
                      selectedModel={selectedModel}
                      setSelectedModel={setSelectedModel}
                      status={status}
                      onModelSelect={(model) => {
                        setSelectedModel(model.value);
                      }}
                      user={user}
                      selectedGroup={selectedGroup}
                      autoRoutedModel={autoRoutedModel}
                      inputRef={inputRef}
                    />
                  )}

                  {/* Action button: Stop / Voice / Send */}
                  {isProcessing ? (
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="rounded-full size-8! transition-colors"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!isEnhancing && !isTypewriting) stop();
                          }}
                          disabled={isEnhancing || isTypewriting}
                        >
                          <StopIcon size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        sideOffset={6}
                        className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!"
                      >
                        <span className="font-medium text-[11px]">Stop Generation</span>
                      </TooltipContent>
                    </Tooltip>
                  ) : input.length === 0 && attachments.length === 0 && !isEnhancing && !isTypewriting ? (
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant={isRecording ? 'destructive' : 'default'}
                          className="rounded-full size-8! transition-colors"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!isEnhancing && !isTypewriting) handleRecord();
                          }}
                          disabled={isEnhancing || isTypewriting}
                        >
                          <AudioLinesIcon ref={audioLinesRef} size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        sideOffset={6}
                        className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!"
                      >
                        <span className="font-medium text-[11px]">
                          {isRecording ? 'Stop Recording' : 'Voice Input'}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          className="rounded-full size-8! transition-colors"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!isEnhancing && !isTypewriting) submitForm();
                          }}
                          disabled={
                            (input.length === 0 && attachments.length === 0 && !isEnhancing && !isTypewriting) ||
                            uploadQueue.length > 0 ||
                            status !== 'ready' ||
                            isEnhancing ||
                            isTypewriting
                          }
                        >
                          <ArrowUpIcon size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        sideOffset={6}
                        className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!"
                      >
                        <span className="font-medium text-[11px]">Send Message</span>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Autocomplete suggestions — absolute, overlays downward, no layout shift */}
              {showSuggestions &&
                suggestions.length > 0 &&
                !hasMessages &&
                !triggerPopup &&
                attachments.length === 0 &&
                uploadQueue.length === 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute -left-px -right-px top-full z-50 bg-muted border border-ring/5 border-t-0 rounded-b-xl overflow-hidden"
                  >
                    {/* <div className="border-t border-border/40" /> */}
                    {suggestions.map((suggestion, index) => {
                      const isHighlighted = index === suggestionIndex;
                      const query = input.trim().toLowerCase();
                      const lower = suggestion.toLowerCase();
                      const matchEnd = lower.startsWith(query) ? query.length : 0;

                      return (
                        <button
                          key={suggestion}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setInput(suggestion);
                            setSuggestions([]);
                            setShowSuggestions(false);
                            setSuggestionIndex(-1);
                          }}
                          onMouseEnter={() => setSuggestionIndex(index)}
                          className={cn(
                            'flex items-center gap-2.5 w-full px-4 py-1.5 text-left transition-colors duration-75',
                            isHighlighted ? 'bg-accent/60' : 'bg-transparent hover:bg-accent/30',
                          )}
                        >
                          <MagnifyingGlassIcon className="size-3.5 shrink-0 text-muted-foreground/60" weight="bold" />
                          <span className="text-[13px] text-foreground/80 truncate">
                            {matchEnd > 0 ? (
                              <>
                                {suggestion.slice(0, matchEnd)}
                                <span className="font-semibold text-foreground">{suggestion.slice(matchEnd)}</span>
                              </>
                            ) : (
                              suggestion
                            )}
                          </span>
                        </button>
                      );
                    })}
                    <div className="h-0" />
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Temporary Chat Hint - only on initial state, signed-in users get fixed-height wrapper to prevent jank */}
        {!hasMessages && user ? (
          <div className="relative h-8">
            <AnimatePresence>
              {isTemporaryChatEnabled && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="absolute inset-x-0 top-0 mt-2 text-center"
                >
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-70"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>This session won&apos;t appear in your history.</span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : !hasMessages && isTemporaryChatEnabled ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
            className="mt-2 text-center"
          >
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-70"
              >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>This session won&apos;t appear in your history.</span>
            </p>
          </motion.div>
        ) : null}

        {/* Sign In Dialog (Voice) */}
        <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
          <DialogContent className="sm:max-w-[400px] p-0 gap-0 overflow-hidden" showCloseButton={false}>
            <div className="relative px-6 pt-8 pb-6 text-center">
              <div className="absolute inset-0 bg-[url('/placeholder.png')] bg-cover bg-center">
                <div className="absolute inset-0 bg-linear-to-t from-background via-background/80 to-background/40" />
              </div>
              <div className="relative z-10 space-y-1.5">
                <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <LockIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold tracking-tight">Sign in required</p>
                <p className="font-pixel text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                  for Voice Input
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-4">
              <div className="rounded-xl border border-border/60 overflow-hidden grid grid-cols-2">
                {[
                  { title: 'Voice input', desc: 'Record & transcribe' },
                  { title: 'Better models', desc: 'GPT-5, Claude 4.6' },
                  { title: 'Search history', desc: 'Keep conversations' },
                  { title: 'Free to start', desc: 'No payment required' },
                ].map((f, i) => (
                  <div
                    key={f.title}
                    className={cn(
                      'flex items-start gap-2 p-2.5',
                      i % 2 === 0 && 'border-r border-border/40',
                      i < 2 && 'border-b border-border/40',
                    )}
                  >
                    <CheckIcon className="size-3 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium leading-tight">{f.title}</p>
                      <p className="font-pixel text-[8px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => {
                  window.location.href = '/sign-in';
                }}
                className="w-full rounded-lg h-9"
              >
                Sign in
              </Button>

              <button
                onClick={() => setShowSignInDialog(false)}
                className="w-full text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
              >
                Maybe later
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </div>
  );
};

export default memo(FormComponent);
