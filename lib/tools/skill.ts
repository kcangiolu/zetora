import { tool } from 'ai';
import { z } from 'zod';
import { getSkill } from '@/lib/skills/registry';
import type { SkillId } from '@/lib/utils';

const SKILL_IDS = [
  'deep-research',
  'extreme-search',
  'academic-review',
  'social-pulse',
  'market-intel',
  'media-scout',
  'local-guide',
  'web-extract',
  'deslop',
] as const;

export const skillTool = tool({
  description: `Load a research skill's instructions to learn how to use it.
    Use this as your VERY FIRST action on every non-greeting message.
    Available skills: deep-research (multi-part questions, comparative analysis),
    extreme-search (single topic, exhaustive coverage),
    academic-review (literature review, scientific consensus),
    social-pulse (sentiment analysis, trending discourse),
    market-intel (stocks, crypto, market analysis),
    media-scout (videos, music, movies),
    local-guide (places, trip planning, weather),
    web-extract (extract from specific URLs),
    deslop (humanize AI-generated text).`,
  inputSchema: z.object({
    skillNames: z.array(z.enum(SKILL_IDS)).min(1).max(3).describe('Array of skill names to load'),
  }),
  execute: async ({ skillNames }: { skillNames: (typeof SKILL_IDS)[number][] }) => {
    const skills = skillNames.map((name) => getSkill(name as SkillId));
    const combinedInstructions = skills.map((s) => `## Skill: ${s.name}\n\n${s.instructions}`).join('\n\n---\n\n');

    return {
      loadedSkills: skills.map((s) => ({ id: s.id, name: s.name })),
      combinedInstructions,
      suggestedTools: [...new Set(skills.flatMap((s) => s.suggestedTools))],
    };
  },
});
