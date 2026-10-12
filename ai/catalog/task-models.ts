import 'server-only';

import { ARCH_ROUTER_MODEL } from '@/ai/models/helpers';
import { TERTIARY_TASKS, type TertiaryTask } from '@/ai/models/tasks';
import { createLogger } from '@/lib/logger';
import { getCatalogEntries, getCatalogEntry } from './store';
import type { CatalogEntry } from './types';

const log = createLogger('task-models');

// The models Zetora runs when the user hasn't picked one in Settings: each
// task's ZETORA_MODEL_* variable, else ZETORA_MODEL_DEFAULT, else the
// cheapest capable model.

const MIN_CONTEXT_WINDOW = 128_000;

// 'chat-title' -> ZETORA_MODEL_CHAT_TITLE
function envKey(task: TertiaryTask): string {
  return `ZETORA_MODEL_${task.toUpperCase().replaceAll('-', '_')}`;
}

function isCapable(entry: CatalogEntry): boolean {
  return (
    !!entry.cost &&
    entry.cost.input > 0 &&
    entry.structuredOutput &&
    (entry.contextWindow ?? 0) >= MIN_CONTEXT_WINDOW &&
    !entry.status &&
    entry.vision &&
    // An always-on reasoner is too slow for background tasks.
    (!entry.reasoning || entry.reasoning.toggle || entry.reasoning.efforts.length > 0)
  );
}

function totalCost(entry: CatalogEntry): number {
  return entry.cost ? entry.cost.input + entry.cost.output : Infinity;
}

// Prefers a lab's own API over aggregators.
function pickCheapestModel(): CatalogEntry | undefined {
  const capable = getCatalogEntries().filter(isCapable);
  const direct = capable.filter((entry) => entry.routes[0]?.host === 'direct');
  return (direct.length ? direct : capable).sort((a, b) => totalCost(a) - totalCost(b))[0];
}

const warned = new Set<string>();

function getConfiguredModelId(task: TertiaryTask): string | undefined {
  const key = envKey(task);
  const configured = process.env[key];
  if (!configured) return undefined;
  const entry = getCatalogEntry(configured);
  if (entry) return entry.id;
  if (!warned.has(configured)) {
    warned.add(configured);
    log.warn(`${key}=${configured} is not in the model catalog, ignoring it`);
  }
  return undefined;
}

export function getTaskModelId(task: TertiaryTask): string | undefined {
  const configured = getConfiguredModelId(task);
  if (configured) return configured;
  if (task === 'auto-router') return ARCH_ROUTER_MODEL.id;
  if (task === 'default') return pickCheapestModel()?.id;
  const defaultModelId = getTaskModelId('default');
  // Reads images: never inherit a default model without vision.
  if (task === 'translate-vision' && defaultModelId && !getCatalogEntry(defaultModelId)?.vision) {
    return pickCheapestModel()?.id;
  }
  return defaultModelId;
}

export function getTaskModelIds(): Record<TertiaryTask, string | null> {
  return Object.fromEntries(TERTIARY_TASKS.map((task) => [task, getTaskModelId(task) ?? null])) as Record<
    TertiaryTask,
    string | null
  >;
}
