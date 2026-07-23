import 'server-only';
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';
import { dynamicXmlToolMiddleware } from '@/ai/xml-tool-middleware';
import { zetora, resolveModel } from '@/ai/providers';

import { createLogger } from '@/lib/logger';

const log = createLogger('tertiary');

// Custom (e.g. Ollama) reasoning models aren't wrapped with this at the
// provider level the way built-in reasoning models are (main chat has a UI
// for <think> content) — but a spoken response must never include it, so
// voice strips it unconditionally regardless of which model answers.
const voiceReasoningMiddleware = extractReasoningMiddleware({ tagName: 'think' });

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
  | 'memory-curator';

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
};

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
  if (customModel) {
    try {
      // resolveModel handles both native zetora-* IDs and custom-{providerId}-{name}
      // IDs, and (given userId) applies the same anonymization/xml-parsing wrapping
      // it would for the main chat model.
      resolved = (await resolveModel(customModel, preferences as Record<string, unknown> | null, userId)) as ReturnType<
        typeof zetora.languageModel
      >;
    } catch {
      log.warn(`[Tertiary] Failed to load model ${customModel}, using default`);
    }
  }

  if (!resolved) {
    resolved = zetora.languageModel(TASK_DEFAULTS[task]);

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

  if (task === 'voice') {
    resolved = wrapLanguageModel({ model: resolved, middleware: voiceReasoningMiddleware });
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
