// Every Zetora function that runs a model of its own. Each one runs on the
// model the user picked in Settings → AI Models, else on the instance's
// ZETORA_MODEL_* variable, else fails: there is no other fallback.
export const TERTIARY_TASKS = [
  'default',
  'chat-title',
  'followup',
  'enhance',
  'tool-repair',
  'auto-router',
  'translate-text',
  'translate-vision',
  'lang-detect',
  'extreme-planner',
  'extreme-agent',
  'voice',
  'memory-curator',
  'context-compaction',
] as const;

export type TertiaryTask = (typeof TERTIARY_TASKS)[number];

export const TASK_LABELS: Record<TertiaryTask, string> = {
  default: 'Default Model',
  'chat-title': 'Chat Title',
  followup: 'Follow-up Questions',
  enhance: 'Prompt Enhancement',
  'tool-repair': 'Tool Call Repair',
  'auto-router': 'Auto Router',
  'translate-text': 'Text Translation',
  'translate-vision': 'Vision Translation',
  'lang-detect': 'Language Detection',
  'extreme-planner': 'Extreme Search Planner',
  'extreme-agent': 'Extreme Search Agent',
  voice: 'Voice (Local Backend)',
  'memory-curator': 'Memory',
  'context-compaction': 'Context Compaction',
};

// Memory has no instance model: without a model picked for it, the chat's
// own model does the work (lib/memory/jobs.ts).
export const TASK_ENV_KEYS: Record<TertiaryTask, string | null> = {
  default: 'ZETORA_MODEL_DEFAULT',
  'chat-title': 'ZETORA_MODEL_CHAT_TITLE',
  followup: 'ZETORA_MODEL_FOLLOWUP',
  enhance: 'ZETORA_MODEL_ENHANCE',
  'tool-repair': 'ZETORA_MODEL_TOOL_REPAIR',
  'auto-router': 'ZETORA_MODEL_AUTO_ROUTER',
  'translate-text': 'ZETORA_MODEL_TRANSLATE_TEXT',
  'translate-vision': 'ZETORA_MODEL_TRANSLATE_VISION',
  'lang-detect': 'ZETORA_MODEL_LANG_DETECT',
  'extreme-planner': 'ZETORA_MODEL_EXTREME_PLANNER',
  'extreme-agent': 'ZETORA_MODEL_EXTREME_AGENT',
  voice: 'ZETORA_MODEL_VOICE',
  'memory-curator': null,
  'context-compaction': 'ZETORA_MODEL_CONTEXT_COMPACTION',
};

// Where each task's model is saved in the user's preferences.
export type TaskPreferenceKey = 'zetora-default-model' | `zetora-tertiary-${Exclude<TertiaryTask, 'default'>}-model`;

export function getTaskPreferenceKey(task: TertiaryTask): TaskPreferenceKey {
  return task === 'default' ? 'zetora-default-model' : (`zetora-tertiary-${task}-model` as const);
}
