import 'server-only';

import { ARCH_ROUTER_MODEL } from '@/ai/models/helpers';
import { TASK_ENV_KEYS, TASK_LABELS, TERTIARY_TASKS, getTaskPreferenceKey, type TertiaryTask } from '@/ai/models/tasks';
import { getOperatorProviders, parseCustomModelId } from '@/lib/custom-providers';
import { getCatalogEntry } from './store';
import type { UserPreferenceValues } from '@/lib/db/schema';

// A model that was asked for but cannot run. Its message is meant for the
// user as is.
export class ModelUnavailableError extends Error {
  override name = 'ModelUnavailableError';
}

// The instance's model for a task: its ZETORA_MODEL_* variable, when that names
// a model the catalog can reach or one of a provider in CUSTOM_AI_PROVIDERS. A
// provider a user added in Settings does not count: it exists for that user only.
export function getTaskModelId(task: TertiaryTask): string | undefined {
  const key = TASK_ENV_KEYS[task];
  const configured = key ? process.env[key] : undefined;
  if (!configured) return undefined;
  if (configured === ARCH_ROUTER_MODEL.id) return configured;
  if (configured.startsWith('custom-')) {
    return parseCustomModelId(configured, getOperatorProviders())?.modelName ? configured : undefined;
  }
  return getCatalogEntry(configured)?.id;
}

export function getTaskModelIds(): Record<TertiaryTask, string | null> {
  return Object.fromEntries(TERTIARY_TASKS.map((task) => [task, getTaskModelId(task) ?? null])) as Record<
    TertiaryTask,
    string | null
  >;
}

// Tasks whose ZETORA_MODEL_* variable names a model the instance cannot reach,
// with that value.
export function getUnavailableTaskModels(): Partial<Record<TertiaryTask, string>> {
  return Object.fromEntries(
    TERTIARY_TASKS.flatMap((task) => {
      const key = TASK_ENV_KEYS[task];
      const configured = key ? process.env[key] : undefined;
      return configured && !getTaskModelId(task) ? [[task, configured]] : [];
    }),
  );
}

// The model a task runs on: the user's pick, else the instance's. Throws when
// there is neither, or when the pick has left the catalog: running the
// instance's model instead would hide that the user's choice no longer holds.
export function getTaskModel(task: TertiaryTask, preferences: UserPreferenceValues | null | undefined): string {
  const picked = preferences?.[getTaskPreferenceKey(task)];
  if (typeof picked === 'string' && picked) {
    // A custom model belongs to a provider the user may have added, which
    // resolveModel checks against that user's own providers.
    if (picked.startsWith('custom-') || picked === ARCH_ROUTER_MODEL.id) return picked;
    const entry = getCatalogEntry(picked);
    if (entry) return entry.id;
    throw new ModelUnavailableError(
      `${TASK_LABELS[task]}: your pick in Settings → AI Models, ${picked}, is not available. It is not in the model catalog, or its provider has no API key. Pick another model there, or reset it to the default.`,
    );
  }
  const modelId = getTaskModelId(task);
  if (modelId) return modelId;

  const key = TASK_ENV_KEYS[task];
  const configured = key ? process.env[key] : undefined;
  if (key && configured) {
    throw new ModelUnavailableError(
      `${TASK_LABELS[task]}: ${key}=${configured} is not available. It is not in the model catalog, its provider has no API key, or its custom provider is not in CUSTOM_AI_PROVIDERS.`,
    );
  }
  throw new ModelUnavailableError(
    `${TASK_LABELS[task]}: no model is configured. Pick one in Settings → AI Models${key ? `, or set ${key}` : ''}.`,
  );
}
