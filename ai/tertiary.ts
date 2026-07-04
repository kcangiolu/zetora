import 'server-only';
import { wrapLanguageModel } from 'ai';
import { dynamicXmlToolMiddleware } from '@/ai/xml-tool-middleware';
import { zetora, resolveModel } from '@/ai/providers';

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
  | 'extreme-agent';

const TASK_DEFAULTS: Record<TertiaryTask, string> = {
  'default': 'zetora-default',
  'chat-title': 'zetora-name',
  'followup': 'zetora-follow-up',
  'enhance': 'zetora-enhance',
  'tool-repair': 'zetora-default',
  'auto-router': 'zetora-arch-router',
  'translate-text': 'zetora-gemini-3-flash',
  'translate-vision': 'zetora-gemini-3-flash',
  'lang-detect': 'zetora-default',
  'extreme-planner': 'zetora-ext-1',
  'extreme-agent': 'zetora-ext-1',
};

const PREF_KEYS: Record<TertiaryTask, { model: string; provider: string }> = {
  'default': { model: 'zetora-default-model', provider: 'zetora-default-provider' },
  'chat-title': { model: 'zetora-tertiary-chat-title-model', provider: 'zetora-tertiary-chat-title-provider' },
  'followup': { model: 'zetora-tertiary-followup-model', provider: 'zetora-tertiary-followup-provider' },
  'enhance': { model: 'zetora-tertiary-enhance-model', provider: 'zetora-tertiary-enhance-provider' },
  'tool-repair': { model: 'zetora-tertiary-tool-repair-model', provider: 'zetora-tertiary-tool-repair-provider' },
  'auto-router': { model: 'zetora-tertiary-auto-router-model', provider: 'zetora-tertiary-auto-router-provider' },
  'translate-text': { model: 'zetora-tertiary-translate-text-model', provider: 'zetora-tertiary-translate-text-provider' },
  'translate-vision': { model: 'zetora-tertiary-translate-vision-model', provider: 'zetora-tertiary-translate-vision-provider' },
  'lang-detect': { model: 'zetora-tertiary-lang-detect-model', provider: 'zetora-tertiary-lang-detect-provider' },
  'extreme-planner': { model: 'zetora-tertiary-extreme-planner-model', provider: 'zetora-tertiary-extreme-planner-provider' },
  'extreme-agent': { model: 'zetora-tertiary-extreme-agent-model', provider: 'zetora-tertiary-extreme-agent-provider' },
};

export async function resolveTertiaryModel(
  task: TertiaryTask,
  preferences: Record<string, string> | null,
) {
  const keys = PREF_KEYS[task];
  const customModel = preferences?.[keys.model];

  let resolved: ReturnType<typeof zetora.languageModel> | undefined;
  if (customModel) {
    try {
      // resolveModel handles both native zetora-* IDs and custom-{providerId}-{name} IDs
      resolved = (await resolveModel(customModel)) as ReturnType<typeof zetora.languageModel>;
    } catch {
      console.warn(`[Tertiary] Failed to load model ${customModel}, using default`);
    }
  }

  if (!resolved) {
    resolved = zetora.languageModel(TASK_DEFAULTS[task]);
  }

  const prefs = preferences as Record<string, unknown> | null;
  const xmlParsingEnabled = prefs?.['zetora-xml-tool-parsing-enabled'] === true;
  const isCustomModel = customModel?.startsWith('custom-');

  if (xmlParsingEnabled && isCustomModel && resolved) {
    return wrapLanguageModel({
      model: resolved,
      middleware: dynamicXmlToolMiddleware,
    });
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
