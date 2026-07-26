import 'server-only';

import type { SpecialModeId } from '@/lib/utils';
import { getExtensionMode } from './extension-modes';

import * as autoGroup from './groups/auto';
import * as connectorsGroup from './groups/connectors';
import * as mcpGroup from './groups/mcp';
import * as multi_agentGroup from './groups/multi-agent';
import * as canvasGroup from './groups/canvas';
import * as deepResearchGroup from './groups/deep-research';
import * as extremeSearchGroup from './groups/extreme-search';

// Sources (web, code, academic, reddit, ...) are no longer individual
// "groups" the model is exclusively restricted to — they're always-on tools
// filtered by the zetora-enabled-sources preference (see getBaseConfig
// below and app/api/search/route.ts). Six modes still fully replace the
// base tool set for a turn: connectors/mcp/multi-agent read from raw
// external systems (user MCP apps, xAI's own search) or canvas changes the
// whole response pipeline, so "run this one thing exclusively" is the right
// model; deep-research and extreme-search instead let the user force a
// specific research methodology or the dedicated extreme_search tool for a
// single message, bypassing the model's own skill-selection in
// groups/auto.ts (see app/api/search/route.ts for the
// zetora-disabled-skills re-validation that gates these two).
const specialGroups = {
  connectors: connectorsGroup,
  mcp: mcpGroup,
  'multi-agent': multi_agentGroup,
  canvas: canvasGroup,
  'deep-research': deepResearchGroup,
  'extreme-search': extremeSearchGroup,
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

// Login is required upstream (lib/search/access-gate.ts) before this is ever
// called, so lightweightUser is always set here — every connected account
// gets every mode, no Pro/Max gate left to check.
export async function getGroupConfig(specialMode: SpecialModeId | string | undefined) {
  if (!specialMode) {
    return getBaseConfig();
  }

  const extensionMode = await getExtensionMode(specialMode);
  if (extensionMode) {
    return { tools: extensionMode.tools, instructions: extensionMode.instructions };
  }

  if (!(specialMode in specialGroups)) {
    return getBaseConfig();
  }

  const resolvedMode = specialMode as keyof typeof specialGroups;

  return {
    tools: specialGroupTools[resolvedMode],
    instructions: specialGroupInstructions[resolvedMode],
  };
}
