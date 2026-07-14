import { tool } from 'ai';
import { z } from 'zod';
import { getAllSkills, getSkill } from '@/lib/skills/registry';
import type { SkillId } from '@/lib/utils';

// Built from the caller's server-computed (auth/Pro-checked) enabled set, not
// a static constant — this is the enforcement point that keeps a disabled or
// gated skill from ever being offered to the model in the first place.
export function createSkillTool(enabledSkillIds: SkillId[], userPreferences?: Record<string, unknown>) {
  const ids = enabledSkillIds.length > 0 ? enabledSkillIds : (getAllSkills().map((s) => s.id) as SkillId[]);
  const idSet = new Set(ids);
  const enumIds = ids as [SkillId, ...SkillId[]];
  const summary = getAllSkills()
    .filter((s) => idSet.has(s.id as SkillId))
    .map((s) => `${s.id} (${s.description})`)
    .join(', ');

  // User-authored guidance from Settings → Image Generation / Image Editing
  // (style/quality tags, negative prompts, checkpoint notes) — appended to the
  // built-in methodology rather than replacing it, so the phase-based flow
  // still applies.
  const customImageGenPrompt =
    typeof userPreferences?.['zetora-image-gen-system-prompt'] === 'string'
      ? (userPreferences['zetora-image-gen-system-prompt'] as string).trim()
      : '';
  const customImageEditPrompt =
    typeof userPreferences?.['zetora-image-edit-system-prompt'] === 'string'
      ? (userPreferences['zetora-image-edit-system-prompt'] as string).trim()
      : '';

  return tool({
    description: `Load a research skill's instructions to learn how to use it.
      Use this as your VERY FIRST action on every non-greeting message.
      Available skills: ${summary}.`,
    inputSchema: z.object({
      skillNames: z.array(z.enum(enumIds)).min(1).max(3).describe('Array of skill names to load'),
    }),
    execute: async ({ skillNames }: { skillNames: SkillId[] }) => {
      const skills = skillNames.filter((name) => idSet.has(name)).map((name) => getSkill(name));
      const combinedInstructions = skills
        .map((s) => {
          const customPrompt =
            s.id === 'image-generation'
              ? customImageGenPrompt
              : s.id === 'image-editing'
                ? customImageEditPrompt
                : '';
          const extra = customPrompt ? `\n\n### User-Provided Guidance\n\n${customPrompt}` : '';
          return `## Skill: ${s.name}\n\n${s.instructions}${extra}`;
        })
        .join('\n\n---\n\n');

      return {
        loadedSkills: skills.map((s) => ({ id: s.id, name: s.name })),
        combinedInstructions,
        suggestedTools: [...new Set(skills.flatMap((s) => s.suggestedTools))],
      };
    },
  });
}

// Static shape used only for AI SDK UI-part type inference (InferUITool) —
// the runtime tool passed to streamText is always built via createSkillTool
// with the caller's server-computed enabled set.
export const skillTool = createSkillTool([]);
