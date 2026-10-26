import 'server-only';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { resolveModel } from '@/ai/providers';
import type { TertiaryTask } from '@/ai/models';
import { getTaskModel } from '@/ai/catalog/task-models';
import { getCustomProviders } from '@/lib/custom-providers';
import {
  type ReasoningEffort,
  getCustomReasoningOverrides,
  getCatalogReasoningOverrides,
  reasoningMaskMiddleware,
} from '@/lib/reasoning-effort';
import type { UserPreferenceValues } from '@/lib/db/schema';

// Merges a reasoning-effort providerOptions override into whatever the
// caller's own generateText/streamText call passes, per provider key — so a
// caller's other providerOptions (e.g. chat-title's textVerbosity/store)
// survive untouched.
function createReasoningOptionsMiddleware(overrides: Record<string, unknown>): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const merged: Record<string, unknown> = { ...(params.providerOptions ?? {}) };
      for (const [providerKey, providerOverride] of Object.entries(overrides)) {
        merged[providerKey] = {
          ...(merged[providerKey] as Record<string, unknown> | undefined),
          ...(providerOverride as Record<string, unknown>),
        };
      }
      // The override values are plain JSON-serializable literals (strings,
      // numbers, booleans, nested objects) — merged's index signature is just
      // too loose (`unknown`) for SharedV3ProviderOptions' JSONObject values.
      return { ...params, providerOptions: merged } as typeof params;
    },
  };
}

// Recommended default reasoning effort per task, shown in Settings and used
// whenever the user hasn't overridden a task's effort preference. Fast,
// deterministic background tasks (title, follow-up questions, voice — the
// latter already unconditionally strips <think> above) default to 'off';
// tasks that benefit from actual reasoning (extreme search, memory curation,
// tool repair) default to 'auto' (untouched provider behavior).
const TASK_RECOMMENDED_EFFORT: Record<TertiaryTask, ReasoningEffort> = {
  default: 'auto',
  'chat-title': 'off',
  followup: 'off',
  enhance: 'auto',
  'tool-repair': 'auto',
  'auto-router': 'auto',
  'translate-text': 'auto',
  'translate-vision': 'auto',
  'lang-detect': 'auto',
  'extreme-planner': 'auto',
  'extreme-agent': 'auto',
  voice: 'off',
  'memory-curator': 'auto',
  // Fast/deterministic background task, same tier as chat-title/followup.
  'context-compaction': 'off',
};

// Mirrors getTaskPreferenceKey (ai/models/tasks.ts).
function effortPrefKey(
  task: TertiaryTask,
): 'zetora-default-effort' | `zetora-tertiary-${Exclude<TertiaryTask, 'default'>}-effort` {
  return task === 'default' ? 'zetora-default-effort' : (`zetora-tertiary-${task}-effort` as const);
}

export async function resolveTertiaryModel(
  task: TertiaryTask,
  preferences: UserPreferenceValues | null,
  userId?: string,
  // For a caller whose output is a mechanical answer (scores, labels) where
  // the model's thinking only adds latency, whatever effort the task is set to.
  effortOverride?: ReasoningEffort,
) {
  // resolveModel handles catalog and custom-{providerId}-{name} ids alike,
  // and (given userId) applies the same anonymization/xml-parsing wrapping
  // it would for the main chat model.
  const effectiveModelId = getTaskModel(task, preferences);
  let resolved = await resolveModel(effectiveModelId, preferences, userId);

  // extreme-agent forces toolChoice: 'required' on every step of its research
  // loop (lib/tools/extreme-search/), which several providers reject while
  // thinking (DeepSeek, Kimi, Qwen...) — so its thinking is always off. There's
  // no UI control for this task's effort (Settings hides it).
  const effort: ReasoningEffort =
    task === 'extreme-agent'
      ? 'off'
      : (effortOverride ?? preferences?.[effortPrefKey(task)] ?? TASK_RECOMMENDED_EFFORT[task]);

  let applyMaskMiddleware = false;

  if (effectiveModelId.startsWith('custom-')) {
    const customProviders = await getCustomProviders(userId);
    const overrides = getCustomReasoningOverrides(effectiveModelId, effort, customProviders);
    applyMaskMiddleware = overrides.applyMaskMiddleware;
    if (Object.keys(overrides.providerOptions).length > 0) {
      resolved = wrapLanguageModel({
        model: resolved,
        middleware: createReasoningOptionsMiddleware(overrides.providerOptions),
      });
    }
  } else {
    const { providerOptions } = getCatalogReasoningOverrides(effectiveModelId, effort);
    if (Object.keys(providerOptions).length > 0) {
      resolved = wrapLanguageModel({ model: resolved, middleware: createReasoningOptionsMiddleware(providerOptions) });
    }
  }

  // Voice always strips <think> regardless of model/backend — a spoken
  // response must never include it (main chat has a UI for it, voice
  // doesn't). Every other mask-only custom model gets it whenever the
  // resolved effort says "off" — this is what protects tasks like
  // `followup` (no other guard) from a local reasoning model's hidden
  // <think> output silently eating the whole output budget.
  if (applyMaskMiddleware || task === 'voice') {
    resolved = wrapLanguageModel({ model: resolved, middleware: reasoningMaskMiddleware });
  }

  return resolved;
}
