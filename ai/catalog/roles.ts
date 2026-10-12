import 'server-only';

import { createLogger } from '@/lib/logger';
import { getCatalogEntries, getCatalogEntry } from './store';
import type { CatalogEntry } from './types';

const log = createLogger('model-roles');

// The models Zetora picks by itself: `default` answers whenever nothing else
// was chosen (signed-out users, lookouts, background tasks without a
// preference), `fast` runs short background tasks (chat titles, follow-up
// questions, prompt enhancement, translation).
export type ModelRole = 'default' | 'fast';

const ROLE_ENV: Record<ModelRole, string> = {
  default: 'ZETORA_DEFAULT_MODEL',
  fast: 'ZETORA_FAST_MODEL',
};

const MIN_CONTEXT_WINDOW = 128_000;

// Without a configured model, the cheapest capable one wins, preferring a
// lab's own API over aggregators.
function isCapable(entry: CatalogEntry, role: ModelRole): boolean {
  return (
    !!entry.cost &&
    entry.cost.input > 0 &&
    entry.structuredOutput &&
    (entry.contextWindow ?? 0) >= MIN_CONTEXT_WINDOW &&
    !entry.status &&
    (role === 'fast' || entry.vision) &&
    // An always-on reasoner is too slow for these.
    (!entry.reasoning || entry.reasoning.toggle || entry.reasoning.efforts.length > 0)
  );
}

function totalCost(entry: CatalogEntry): number {
  return entry.cost ? entry.cost.input + entry.cost.output : Infinity;
}

function pickRoleModel(role: ModelRole): CatalogEntry | undefined {
  const capable = getCatalogEntries().filter((entry) => isCapable(entry, role));
  const direct = capable.filter((entry) => entry.routes[0]?.host === 'direct');
  return (direct.length ? direct : capable).sort((a, b) => totalCost(a) - totalCost(b))[0];
}

const warned = new Set<string>();

export function getRoleModelId(role: ModelRole): string | undefined {
  const configured = process.env[ROLE_ENV[role]];
  if (configured) {
    const entry = getCatalogEntry(configured);
    if (entry) return entry.id;
    if (!warned.has(configured)) {
      warned.add(configured);
      log.warn(`${ROLE_ENV[role]}=${configured} is not in the model catalog, picking a model automatically`);
    }
  }
  return pickRoleModel(role)?.id;
}
