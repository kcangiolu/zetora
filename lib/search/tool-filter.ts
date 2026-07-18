import { toolGroupMap } from '@/lib/search/groups/auto';
import { getAllSkillIds } from '@/lib/skills/registry';
import type { SkillId, SpecialModeId } from '@/lib/utils';

export function filterActiveTools({
  tools,
  specialMode,
  isSignedIn,
  isMaxUser,
  preferences,
  sessionEnabledSources,
}: {
  tools: readonly string[];
  specialMode: SpecialModeId | 'buddy' | undefined;
  isSignedIn: boolean;
  isMaxUser: boolean;
  preferences: Record<string, unknown> | undefined;
  sessionEnabledSources: unknown;
}): string[] {
  let activeTools = [...tools];

  // Image generation/editing are Max-only — strip them for everyone else,
  // regardless of which mode/group surfaced them.
  if (!isMaxUser) {
    activeTools = activeTools.filter((toolName) => toolName !== 'generate_image' && toolName !== 'edit_image');
  }

  // Base Sources+Skills path (no exclusive special mode): narrow the bundled
  // tool set to what the user actually enabled, and never offer extreme_search
  // to signed-out users (it used to require the 'extreme' group's requireAuth
  // gate; that gate now lives here since extreme_search is an always-on tool).
  // zetora-visible-modes is the pre-migration key name, read as a fallback in
  // case a client hasn't run the one-time copy to zetora-enabled-sources yet.
  if (!specialMode) {
    const globalEnabledSources = (preferences?.['zetora-enabled-sources'] ?? preferences?.['zetora-visible-modes']) as
      | string[]
      | undefined;
    // Session-only override sent by the client (see components/chat-interface.tsx):
    // never persisted, so it narrows this request's tools without touching the
    // account-wide preference read above.
    const sessionOverride = Array.isArray(sessionEnabledSources) ? (sessionEnabledSources as string[]) : undefined;
    let enabledSources = globalEnabledSources;
    if (sessionOverride && sessionOverride.length > 0) {
      const sessionSet = new Set(sessionOverride);
      enabledSources =
        globalEnabledSources && globalEnabledSources.length > 0
          ? globalEnabledSources.filter((id) => sessionSet.has(id))
          : sessionOverride;
    }
    if (enabledSources && enabledSources.length > 0) {
      const enabledSet = new Set(enabledSources);
      activeTools = activeTools.filter((toolName) => {
        const owningGroup = toolGroupMap[toolName];
        return !owningGroup || enabledSet.has(owningGroup);
      });
    }
    if (!isSignedIn) {
      activeTools = activeTools.filter((toolName) => toolName !== 'extreme_search');
    }
  }

  return activeTools;
}

export function getEnabledSkillIds(preferences: Record<string, unknown> | undefined): SkillId[] {
  const disabledSkillIds = new Set((preferences?.['zetora-disabled-skills'] as string[] | undefined) ?? []);
  return getAllSkillIds().filter((skillId) => !disabledSkillIds.has(skillId)) as SkillId[];
}
