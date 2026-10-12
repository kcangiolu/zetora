// Every Zetora function that runs a model of its own. Each one's model is set
// per instance with a ZETORA_MODEL_* variable (ai/catalog/task-models.ts) and
// can be overridden per user in Settings → AI Models.
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
