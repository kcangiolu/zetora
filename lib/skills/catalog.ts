import type { SkillId } from '@/lib/utils';

// Client-safe metadata for the Settings → Skills directory — no 'instructions'
// text (that's the actual prompt engineering, kept server-only in registry.ts,
// same separation as getSearchGroups() in lib/utils.ts vs lib/search/groups/*.ts).
export interface SkillCatalogEntry {
  id: SkillId;
  name: string;
  description: string;
  category: string;
  section: 'core' | 'other';
}

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: 'deep-research',
    name: 'Deep Research',
    description:
      'Multi-part questions, comparative analysis, "explain why" — decomposes into sub-questions and cross-validates.',
    category: 'RESEARCH',
    section: 'core',
  },
  {
    id: 'extreme-search',
    name: 'Extreme Search',
    description: 'Single topic, contested/niche, "find everything about" — maximal fan-out on one thematic axis.',
    category: 'RESEARCH',
    section: 'core',
  },
  {
    id: 'web-extract',
    name: 'Web Extract',
    description: 'Extract from specific URLs.',
    category: 'DATA',
    section: 'core',
  },
  {
    id: 'deslop',
    name: 'Deslop',
    description: 'Humanize/paraphrase AI-generated text.',
    category: 'CONTENT',
    section: 'core',
  },
  {
    id: 'academic-review',
    name: 'Academic Review',
    description: 'Literature review, scientific consensus, "what does research say".',
    category: 'RESEARCH',
    section: 'other',
  },
  {
    id: 'social-pulse',
    name: 'Social Pulse',
    description: 'Sentiment analysis, trending discourse, "what are people saying".',
    category: 'SOCIAL',
    section: 'other',
  },
  {
    id: 'market-intel',
    name: 'Market Intel',
    description: 'Stocks, crypto, market outlook, financial analysis.',
    category: 'FINANCE',
    section: 'other',
  },
  {
    id: 'media-scout',
    name: 'Media Scout',
    description: 'Videos, music, movies, "recommend me".',
    category: 'MEDIA',
    section: 'other',
  },
  {
    id: 'local-guide',
    name: 'Local Guide',
    description: 'Places, trip planning, weather, flights.',
    category: 'LOCAL',
    section: 'other',
  },
];
