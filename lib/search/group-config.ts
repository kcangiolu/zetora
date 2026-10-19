import 'server-only';

import type { SpecialModeId } from '@/lib/search/search-groups';

import * as autoGroup from './groups/auto';
import * as mcpGroup from './groups/mcp';
import * as canvasGroup from './groups/canvas';
import * as deepResearchGroup from './groups/deep-research';
import * as extremeSearchGroup from './groups/extreme-search';

// Sources are always-on tools filtered by the zetora-enabled-sources preference (see
// getBaseConfig). These modes replace the base tool set for one message: mcp and canvas
// change the whole pipeline; deep-research and extreme-search force one methodology,
// bypassing skill selection (re-validated against zetora-disabled-skills in
// app/api/search/route.ts).
const specialGroups = {
  mcp: mcpGroup,
  canvas: canvasGroup,
  'deep-research': deepResearchGroup,
  'extreme-search': extremeSearchGroup,
};

// Spelled out per group rather than mapped from Object.entries(specialGroups): knip
// can't trace exports read through that mapping and reports them as unused.
const specialGroupTools = {
  mcp: mcpGroup.tools,
  canvas: canvasGroup.tools,
  'deep-research': deepResearchGroup.tools,
  'extreme-search': extremeSearchGroup.tools,
} satisfies Record<keyof typeof specialGroups, readonly string[]>;

const specialGroupInstructions = {
  mcp: mcpGroup.instructions,
  canvas: canvasGroup.instructions,
  'deep-research': deepResearchGroup.instructions,
  'extreme-search': extremeSearchGroup.instructions,
} satisfies Record<keyof typeof specialGroups, string>;

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

  if (!(specialMode in specialGroups)) {
    return getBaseConfig();
  }

  const resolvedMode = specialMode as keyof typeof specialGroups;

  return {
    tools: specialGroupTools[resolvedMode],
    instructions: specialGroupInstructions[resolvedMode],
  };
}
