import 'server-only';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { dynamicXmlToolMiddleware } from '@/ai/xml-tool-middleware';
import { zetora, resolveModel } from '@/ai/providers';
import { getCustomProviders } from '@/lib/custom-providers';
import {
  type ReasoningEffort,
  getCustomReasoningOverrides,
  getZetoraReasoningOverrides,
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
  | 'agent-worker'
  | 'agent-guard';

const TASK_DEFAULTS: Record<TertiaryTask, string> = {
  default: 'zetora-default',
  'chat-title': 'zetora-name',
  followup: 'zetora-follow-up',
  enhance: 'zetora-enhance',
  'tool-repair': 'zetora-default',
  'auto-router': 'zetora-arch-router',
  'translate-text': 'zetora-gemini-3-flash',
  'translate-vision': 'zetora-gemini-3-flash',
  'lang-detect': 'zetora-default',
  'extreme-planner': 'zetora-ext-1',
  'extreme-agent': 'zetora-ext-1',
  voice: 'zetora-default',
  // Reviews finished turns and decides what to store — needs reliable tool
  // calling (search_memories/add_memory), not a fast summarizer model.
  'memory-curator': 'zetora-default',
  // Drives the OpenCode session inside the sandbox (bash/edit/read loop) via
  // the gateway at /api/agent/llm/v1 — needs strong, reliable tool calling
  // over many steps, so a coding-grade model rather than a fast summarizer.
  'agent-worker': 'zetora-anthropic-sonnet-5',
  // L1 intent verification: re-reads the user's original request against each
  // proposed action. Sits in the critical path of every high-risk tool call,
  // so it must be fast and cheap — and deliberately defaults to a DIFFERENT
  // provider from agent-worker, so one provider outage can't take out both
  // the actor and its reviewer at once.
  'agent-guard': 'zetora-gemini-3-flash',
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
  'agent-worker': 'auto',
  // The guard returns a small structured verdict under a 12s timeout, and a
  // timeout is a fail-closed HUMAN_CHECK — reasoning tokens here buy latency,
  // not safety.
  'agent-guard': 'off',
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
  'agent-worker': { model: 'zetora-tertiary-agent-worker-model', provider: 'zetora-tertiary-agent-worker-provider' },
  'agent-guard': { model: 'zetora-tertiary-agent-guard-model', provider: 'zetora-tertiary-agent-guard-provider' },
};

export async function resolveTertiaryModel(
  task: TertiaryTask,
  preferences: Record<string, string> | null,
  userId?: string,
) {
  const keys = PREF_KEYS[task];
  const customModel = preferences?.[keys.model];
  const isCustomModel = customModel?.startsWith('custom-');

  let resolved: ReturnType<typeof zetora.languageModel> | undefined;
  let effectiveModelId = TASK_DEFAULTS[task];
  if (customModel) {
    try {
      // resolveModel handles both native zetora-* IDs and custom-{providerId}-{name}
      // IDs, and (given userId) applies the same anonymization/xml-parsing wrapping
      // it would for the main chat model.
      resolved = (await resolveModel(customModel, preferences as Record<string, unknown> | null, userId)) as ReturnType<
        typeof zetora.languageModel
      >;
      effectiveModelId = customModel;
    } catch {
      log.warn(`[Tertiary] Failed to load model ${customModel}, using default`);
    }
  }

  if (!resolved) {
    resolved = zetora.languageModel(TASK_DEFAULTS[task]);
    effectiveModelId = TASK_DEFAULTS[task];

    const prefs = preferences as Record<string, unknown> | null;
    const xmlParsingEnabled = prefs?.['zetora-xml-tool-parsing-enabled'] === true;
    if (xmlParsingEnabled && isCustomModel) {
      resolved = wrapLanguageModel({ model: resolved, middleware: dynamicXmlToolMiddleware });
    }

    const anonymizationEnabled = prefs?.['zetora-anonymization-enabled'] === true;
    if (userId && anonymizationEnabled) {
      const { createAnonymizationMiddleware } = await import('./anonymization-middleware');
      resolved = wrapLanguageModel({
        model: resolved,
        middleware: createAnonymizationMiddleware({
          userId,
          denyTerms: (prefs?.['zetora-anonymization-custom-terms'] as string[] | undefined) ?? [],
          failOpen: prefs?.['zetora-anonymization-fail-open'] === true,
        }),
      });
    }
  }

  const effort = (preferences?.[effortPrefKey(task)] as ReasoningEffort | undefined) ?? TASK_RECOMMENDED_EFFORT[task];

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
    const { providerOptions } = getZetoraReasoningOverrides(effectiveModelId, effort);
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
