import 'server-only';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { resolveModel } from '@/ai/providers';
import { DEFAULT_MODEL_ALIAS, FAST_MODEL_ALIAS } from '@/ai/models';
import { getCustomProviders } from '@/lib/custom-providers';
import {
  type ReasoningEffort,
  getCustomReasoningOverrides,
  getCatalogReasoningOverrides,
  reasoningMaskMiddleware,
} from '@/lib/reasoning-effort';

import { createLogger } from '@/lib/logger';

const log = createLogger('tertiary');

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

export type TertiaryTask =
  | 'default'
  | 'chat-title'
  | 'followup'
  | 'enhance'
  | 'tool-repair'
  | 'auto-router'
  | 'translate-text'
  | 'translate-vision'
  | 'lang-detect'
  | 'extreme-planner'
  | 'extreme-agent'
  | 'voice'
  | 'memory-curator'
  | 'context-compaction';

// Every task runs on one of the instance's two role models (ai/catalog/roles.ts)
// unless the user picked a model for it.
const TASK_DEFAULTS: Record<TertiaryTask, string> = {
  default: DEFAULT_MODEL_ALIAS,
  'chat-title': FAST_MODEL_ALIAS,
  followup: FAST_MODEL_ALIAS,
  enhance: FAST_MODEL_ALIAS,
  'tool-repair': DEFAULT_MODEL_ALIAS,
  'auto-router': 'zetora-arch-router',
  'translate-text': FAST_MODEL_ALIAS,
  // Reads images: the default model is the one guaranteed to have vision.
  'translate-vision': DEFAULT_MODEL_ALIAS,
  'lang-detect': FAST_MODEL_ALIAS,
  'extreme-planner': DEFAULT_MODEL_ALIAS,
  'extreme-agent': DEFAULT_MODEL_ALIAS,
  voice: DEFAULT_MODEL_ALIAS,
  // Only used for weekly memory consolidation, or for every memory update
  // when the user picks a dedicated model — by default a chat turn's memory
  // update runs on the conversation's own model (see lib/memory/jobs.ts).
  // Needs reliable structured output.
  'memory-curator': DEFAULT_MODEL_ALIAS,
  // Needs to comfortably read a long, possibly noisy conversation dump
  // (raw tool-call traces included) and produce a coherent summary.
  'context-compaction': DEFAULT_MODEL_ALIAS,
};

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

// Mirrors the `zetora-tertiary-<task>-model`/`-provider` naming above.
function effortPrefKey(task: TertiaryTask): string {
  return task === 'default' ? 'zetora-default-effort' : `zetora-tertiary-${task}-effort`;
}

const PREF_KEYS: Record<TertiaryTask, { model: string; provider: string }> = {
  default: { model: 'zetora-default-model', provider: 'zetora-default-provider' },
  'chat-title': { model: 'zetora-tertiary-chat-title-model', provider: 'zetora-tertiary-chat-title-provider' },
  followup: { model: 'zetora-tertiary-followup-model', provider: 'zetora-tertiary-followup-provider' },
  enhance: { model: 'zetora-tertiary-enhance-model', provider: 'zetora-tertiary-enhance-provider' },
  'tool-repair': { model: 'zetora-tertiary-tool-repair-model', provider: 'zetora-tertiary-tool-repair-provider' },
  'auto-router': { model: 'zetora-tertiary-auto-router-model', provider: 'zetora-tertiary-auto-router-provider' },
  'translate-text': {
    model: 'zetora-tertiary-translate-text-model',
    provider: 'zetora-tertiary-translate-text-provider',
  },
  'translate-vision': {
    model: 'zetora-tertiary-translate-vision-model',
    provider: 'zetora-tertiary-translate-vision-provider',
  },
  'lang-detect': { model: 'zetora-tertiary-lang-detect-model', provider: 'zetora-tertiary-lang-detect-provider' },
  'extreme-planner': {
    model: 'zetora-tertiary-extreme-planner-model',
    provider: 'zetora-tertiary-extreme-planner-provider',
  },
  'extreme-agent': { model: 'zetora-tertiary-extreme-agent-model', provider: 'zetora-tertiary-extreme-agent-provider' },
  voice: { model: 'zetora-tertiary-voice-model', provider: 'zetora-tertiary-voice-provider' },
  'memory-curator': {
    model: 'zetora-tertiary-memory-curator-model',
    provider: 'zetora-tertiary-memory-curator-provider',
  },
  'context-compaction': {
    model: 'zetora-tertiary-context-compaction-model',
    provider: 'zetora-tertiary-context-compaction-provider',
  },
};

export async function resolveTertiaryModel(
  task: TertiaryTask,
  preferences: Record<string, string> | null,
  userId?: string,
) {
  const customModel = preferences?.[PREF_KEYS[task].model];
  const prefs = preferences as Record<string, unknown> | null;

  // resolveModel handles catalog, role-alias and custom-{providerId}-{name}
  // ids alike, and (given userId) applies the same anonymization/xml-parsing
  // wrapping it would for the main chat model.
  let effectiveModelId = customModel || TASK_DEFAULTS[task];
  let resolved: LanguageModelV3;
  try {
    resolved = await resolveModel(effectiveModelId, prefs, userId);
  } catch (error) {
    if (!customModel) throw error;
    log.warn(`[Tertiary] Failed to load model ${customModel}, using default`);
    effectiveModelId = TASK_DEFAULTS[task];
    resolved = await resolveModel(effectiveModelId, prefs, userId);
  }

  // extreme-agent forces toolChoice: 'required' on every step of its research
  // loop (lib/tools/extreme-search.ts), which several providers reject while
  // thinking (DeepSeek, Kimi, Qwen...) — so its thinking is always off. There's
  // no UI control for this task's effort (Settings hides it).
  const effort: ReasoningEffort =
    task === 'extreme-agent'
      ? 'off'
      : ((preferences?.[effortPrefKey(task)] as ReasoningEffort | undefined) ?? TASK_RECOMMENDED_EFFORT[task]);

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

export function getTertiaryModelConfig(task: TertiaryTask, preferences: Record<string, string> | null) {
  const keys = PREF_KEYS[task];
  const model = preferences?.[keys.model];
  const provider = preferences?.[keys.provider];

  if (model && provider) {
    return { model, provider, isCustom: true };
  }

  return { model: TASK_DEFAULTS[task], provider: 'zetora', isCustom: false };
}
