import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getHermesConnectorStatusAction } from '@/app/actions';
import type { ComprehensiveUserData } from '@/hooks/use-user-data';
import { useInstanceCapabilities } from '@/hooks/use-instance-capabilities';
import { useSessionPreference } from '@/hooks/use-session-preference';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import type { HermesChatLock } from '@/lib/hermes/chat-mode';
import { isHermesEnabled } from '@/lib/hermes/enabled';
import { isSearchGroupAvailable, pickSearchProvider } from '@/lib/search/providers';
import { getSearchGroups, type SearchGroupId } from '@/lib/search/search-groups';

// The single-purpose search tools, always on and filtered by the zetora-enabled-sources
// preference. Apps, Canvas and the Agent stay exclusive modes since they replace the
// whole tool set (or, for Canvas, the whole response pipeline) rather than adding one.
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

const VALID_SPECIAL_MODES = new Set<string>(['auto', 'mcp', 'canvas', 'deep-research', 'extreme-search', 'hermes']);

const MODE_ORDER = ['deep-research', 'extreme-search', 'mcp', 'canvas', 'hermes'];

// The modes and sources the composer offers, from the instance, the user's preferences
// and this chat's lane.
export function useModeOptions({
  user,
  selectedGroup,
  setSelectedGroup,
  hermesChatLock,
  isHermesChat,
}: {
  user: ComprehensiveUserData | null;
  selectedGroup: SearchGroupId;
  setSelectedGroup: (group: SearchGroupId) => void;
  hermesChatLock: HermesChatLock;
  isHermesChat: boolean;
}) {
  const hermesEnvEnabled = isHermesEnabled();
  // "Show this mode in the + menu", on top of the instance-level switch.
  const [appsEnabledPref] = useSyncedPreferences<boolean>('zetora-apps-enabled', true);
  const [canvasEnabledPref] = useSyncedPreferences<boolean>('zetora-canvas-enabled', true);
  // A disabled skill cannot be forced either; Settings > Skills writes this list.
  const [disabledSkillsPref] = useSyncedPreferences<string[]>('zetora-disabled-skills', []);
  const mcpEnabled = process.env.NEXT_PUBLIC_MCP_ENABLED === 'true' && appsEnabledPref;
  const canvasEnabled = process.env.NEXT_PUBLIC_CANVAS_ENABLED === 'true' && canvasEnabledPref;

  // The Agent follows the server-side enrollment (Settings > Hermes), not a preference.
  const { data: hermesConnectorStatus, isSuccess: isHermesConnectorStatusResolved } = useQuery({
    queryKey: ['hermesConnectorStatus', user?.id],
    queryFn: () => getHermesConnectorStatusAction(),
    enabled: !!user && hermesEnvEnabled,
    staleTime: 30_000,
  });
  const hermesEnabled = hermesEnvEnabled && hermesConnectorStatus?.connector?.status === 'enrolled';
  // False once this chat's first message went through native search (resolveHermesChatLock).
  const hermesSelectableForChat = hermesEnabled && hermesChatLock !== 'search';
  // A chat committed to the Agent can never leave it.
  const isHermesLocked = isHermesChat;

  const [searchProviderPref] = useSyncedPreferences<string>('zetora-search-provider', '');
  const capabilities = useInstanceCapabilities();
  const availableSearchProviders = capabilities?.searchProviders;
  const searchGroups = useMemo(
    () =>
      getSearchGroups(
        pickSearchProvider('web', searchProviderPref, availableSearchProviders ?? []) ?? undefined,
      ).filter((group) => isSearchGroupAvailable(group.id, capabilities)),
    [searchProviderPref, availableSearchProviders, capabilities],
  );
  const [visibleModes] = useSyncedPreferences<string[]>('zetora-visible-modes', []);
  const [modeOrder] = useSyncedPreferences<string[]>('zetora-group-order', []);

  // Sources: an empty zetora-enabled-sources falls back to the older zetora-visible-modes
  // key. Owned by Preferences > Customize; the chat only reads it.
  const [enabledSourcesPref] = useSyncedPreferences<string[]>('zetora-enabled-sources', []);
  const globalEnabledSources =
    enabledSourcesPref.length > 0
      ? enabledSourcesPref
      : (visibleModes ?? []).filter((id) => (SOURCE_CATALOG_IDS as readonly string[]).includes(id));
  const isGloballyEnabled = useCallback(
    (id: string) => globalEnabledSources.length === 0 || globalEnabledSources.includes(id),
    [globalEnabledSources],
  );
  // Turning a source off in the chat hides it for this browser session only, without
  // touching the account-wide preference. null means untouched this session; [] is an
  // explicit "everything unchecked".
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
      setSessionEnabledSources(base.includes(id) ? base.filter((s) => s !== id) : [...base, id]);
    },
    [sessionEnabledSources, isGloballyEnabled, setSessionEnabledSources],
  );
  const enabledSourcesCount = SOURCE_CATALOG_IDS.filter((id) => isSourceEnabled(id)).length;

  // The rows of the Sources submenu are fixed when it opens, so unchecking a source
  // never removes the row under the cursor.
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [listedSourceIds, setListedSourceIds] = useState<string[]>([]);
  const toggleSourcesExpanded = useCallback(() => {
    setSourcesExpanded((prev) => {
      if (!prev) setListedSourceIds(SOURCE_CATALOG_IDS.filter((id) => isGloballyEnabled(id)));
      return !prev;
    });
  }, [isGloballyEnabled]);

  const isOffered = useCallback(
    (group: (typeof searchGroups)[number]) => group.show && !('requireAuth' in group && group.requireAuth && !user),
    [user],
  );

  // What '@' offers.
  const sourceGroups = useMemo(() => {
    let groups = searchGroups.filter(
      (group) => isOffered(group) && group.id !== 'extreme' && group.id !== 'canvas' && group.id !== 'mcp',
    );
    if (visibleModes && visibleModes.length > 0) {
      const visible = new Set(visibleModes);
      groups = groups.filter((group) => visible.has(group.id));
    }
    if (!modeOrder || modeOrder.length === 0) return groups;
    const position = new Map(modeOrder.map((id, i) => [id, i]));
    return [...groups].sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity));
  }, [searchGroups, visibleModes, modeOrder, isOffered]);

  // What '/' offers. 'extreme-search' forces the extreme_search tool for one message; the
  // retired 'extreme' mode is never offered.
  const modeGroups = useMemo(() => {
    const modeIds = new Set<string>();
    if (!disabledSkillsPref.includes('deep-research')) modeIds.add('deep-research');
    if (!disabledSkillsPref.includes('extreme-search')) modeIds.add('extreme-search');
    if (canvasEnabled) modeIds.add('canvas');
    if (mcpEnabled) modeIds.add('mcp');
    if (hermesSelectableForChat) modeIds.add('hermes');
    return searchGroups
      .filter((group) => isOffered(group) && modeIds.has(group.id))
      .sort((a, b) => MODE_ORDER.indexOf(a.id) - MODE_ORDER.indexOf(b.id));
  }, [searchGroups, canvasEnabled, mcpEnabled, hermesSelectableForChat, disabledSkillsPref, isOffered]);

  // A stored group that is not an exclusive mode (an old value such as 'web'), or a mode
  // the user has since hidden, falls back to 'auto'.
  useEffect(() => {
    if (!VALID_SPECIAL_MODES.has(selectedGroup)) {
      setSelectedGroup('auto');
      return;
    }
    const isHidden =
      (selectedGroup === 'canvas' && !canvasEnabled) ||
      (selectedGroup === 'mcp' && !mcpEnabled) ||
      (selectedGroup === 'deep-research' && disabledSkillsPref.includes('deep-research')) ||
      (selectedGroup === 'extreme-search' && disabledSkillsPref.includes('extreme-search')) ||
      // This writes a cross-chat preference from an async value, so it needs the
      // connector query to have answered, and a chat locked to the Agent must not
      // rewrite every other chat's choice.
      (selectedGroup === 'hermes' && !isHermesLocked && isHermesConnectorStatusResolved && !hermesSelectableForChat);
    if (isHidden) setSelectedGroup('auto');
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

  return {
    searchGroups,
    sourceGroups,
    modeGroups,
    mcpEnabled,
    canvasEnabled,
    hermesSelectableForChat,
    isHermesLocked,
    sources: {
      count: enabledSourcesCount,
      isEnabled: isSourceEnabled,
      toggle: toggleSource,
      expanded: sourcesExpanded,
      toggleExpanded: toggleSourcesExpanded,
      listedIds: listedSourceIds,
    },
  };
}

export type ModeOptions = ReturnType<typeof useModeOptions>;
