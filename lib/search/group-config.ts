import 'server-only';

import type { ComprehensiveUserData } from '@/lib/user-data-server';
import { getComprehensiveUserData } from '@/lib/user-data-server';
import type { SpecialModeId } from '@/lib/utils';
import { getExtensionMode } from './extension-modes';

import * as autoGroup from './groups/auto';
import * as memoryGroup from './groups/memory';
import * as connectorsGroup from './groups/connectors';
import * as mcpGroup from './groups/mcp';
import * as multi_agentGroup from './groups/multi-agent';
import * as buddyGroup from './groups/buddy';
import * as canvasGroup from './groups/canvas';

// Legacy hardcoded modes, plus (as a plain string) any id an extension
// registered at boot via registerExtensionMode (lib/search/extension-modes.ts).
type LegacySpecialModeId = SpecialModeId | 'buddy';

// Sources (web, code, academic, reddit, ...) are no longer individual
// "groups" the model is exclusively restricted to — they're always-on tools
// filtered by the zetora-enabled-sources preference (see getBaseConfig
// below and app/api/search/route.ts). Only these five modes still fully
// replace the base tool set for a turn: they read from raw external
// systems (memory store, connectors, user MCP apps, xAI's own search) or
// change the whole response pipeline (canvas), so "run this one thing
// exclusively" remains the right model.
const specialGroups = {
  memory: memoryGroup,
  connectors: connectorsGroup,
  mcp: mcpGroup,
  'multi-agent': multi_agentGroup,
  buddy: buddyGroup,
  canvas: canvasGroup,
};

const specialGroupTools = Object.fromEntries(
  Object.entries(specialGroups).map(([id, group]) => [id, group.tools]),
) as {
  [K in keyof typeof specialGroups]: (typeof specialGroups)[K]['tools'];
};

const specialGroupInstructions = Object.fromEntries(
  Object.entries(specialGroups).map(([id, group]) => [id, group.instructions]),
) as Record<keyof typeof specialGroups, string>;

// The always-on default: Auto's bundled tool set, further narrowed by
// zetora-enabled-sources (app/api/search/route.ts) and zetora-disabled-skills
// (via the skill tool factory) — no group-exclusive tool restriction anymore.
export function getBaseConfig() {
  return { tools: autoGroup.tools, instructions: autoGroup.instructions };
}

export async function getGroupConfig(
  specialMode: LegacySpecialModeId | string | undefined,
  lightweightUser?: { userId: string; email: string; isProUser: boolean } | null,
  fullUserPromise?: Promise<ComprehensiveUserData | null>,
) {
  if (!specialMode) {
    return getBaseConfig();
  }

  const extensionMode = getExtensionMode(specialMode);
  if (extensionMode) {
    const requireAuth = extensionMode.requireAuth !== false;

    if (!lightweightUser) {
      const user = fullUserPromise ? await fullUserPromise : await getComprehensiveUserData();
      if (!user) {
        if (requireAuth) return getBaseConfig();
      } else if (extensionMode.requirePro && !user.isProUser) {
        return getBaseConfig();
      }
    } else if (extensionMode.requirePro && !lightweightUser.isProUser) {
      return getBaseConfig();
    }

    return { tools: extensionMode.tools, instructions: extensionMode.instructions };
  }

  if (!(specialMode in specialGroups)) {
    return getBaseConfig();
  }

  let resolvedMode: LegacySpecialModeId | null = specialMode as LegacySpecialModeId;

  const requiresPro = specialMode === 'connectors' || specialMode === 'mcp' || specialMode === 'multi-agent' || specialMode === 'canvas';

  if (!lightweightUser) {
    const user = fullUserPromise ? await fullUserPromise : await getComprehensiveUserData();
    if (!user) {
      resolvedMode = null;
    } else if (requiresPro && !user.isProUser) {
      resolvedMode = null;
    }
  } else if (requiresPro && !lightweightUser.isProUser) {
    resolvedMode = null;
  }

  if (!resolvedMode) {
    return getBaseConfig();
  }

  return {
    tools: specialGroupTools[resolvedMode],
    instructions: specialGroupInstructions[resolvedMode],
  };
}
