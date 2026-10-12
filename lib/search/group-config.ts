import 'server-only';

import type { SpecialModeId } from '@/lib/utils';

import * as autoGroup from './groups/auto';
import * as mcpGroup from './groups/mcp';
import * as canvasGroup from './groups/canvas';
import * as deepResearchGroup from './groups/deep-research';
import * as extremeSearchGroup from './groups/extreme-search';

// Sources (web, code, academic, reddit, ...) are no longer individual
// "groups" the model is exclusively restricted to — they're always-on tools
// filtered by the zetora-enabled-sources preference (see getBaseConfig
// below and app/api/search/route.ts). Four modes still fully replace the
// base tool set for a turn: mcp reads from the user's MCP apps or canvas
// changes the
// whole response pipeline, so "run this one thing exclusively" is the right
// model; deep-research and extreme-search instead let the user force a
// specific research methodology or the dedicated extreme_search tool for a
// single message, bypassing the model's own skill-selection in
// groups/auto.ts (see app/api/search/route.ts for the
// zetora-disabled-skills re-validation that gates these two).
const specialGroups = {
  mcp: mcpGroup,
  canvas: canvasGroup,
  'deep-research': deepResearchGroup,
  'extreme-search': extremeSearchGroup,
};

// Direct property access, not a mapped Object.entries(specialGroups) derivation
// as this used to read: knip's static analysis can't trace an export through
// `Object.entries(nsImport).map(([, g]) => g.tools)`, so deepResearchGroup's
// and extremeSearchGroup's `tools`/`instructions` were reported as unused
// dead code despite being read right here — a false positive that broke the
// dead-code CI check. Spelling out each group by name is what makes every
// export's use traceable again, by knip and by a human reader alike.
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
