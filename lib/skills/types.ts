export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  /** Additional system prompt injected while the skill is active. */
  instructions: string;
  /** Tools the model is nudged toward; it may still use others. */
  suggestedTools: string[];
  /** If true, the skill takes priority and overrides default mode behavior. */
  exclusive?: boolean;
  /** Badge shown on the Settings → Skills card, e.g. 'RESEARCH', 'FINANCE'. */
  category: string;
  /** Grouping used by the Settings → Skills directory layout. */
  section: 'core' | 'other';
}
