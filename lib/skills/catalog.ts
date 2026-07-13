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
      'Multi-part questions, comparative analysis, "explain why" — decomposes into sub-questions and cross-validates. Use when the question has several distinct aspects that each need research. NOT for simple factual lookups or single-topic questions.',
    category: 'RESEARCH',
    section: 'core',
  },
  {
    id: 'extreme-search',
    name: 'Extreme Search',
    description:
      'Single topic, contested/niche, "find everything about" — maximal fan-out on one thematic axis. Use when one specific topic needs exhaustive coverage from many angles. NOT for multi-part questions (use deep-research) or simple lookups.',
    category: 'RESEARCH',
    section: 'core',
  },
  {
    id: 'web-extract',
    name: 'Web Extract',
    description:
      'Extract and summarize content from specific URLs the user provides. ONLY when the user pastes or mentions exact URLs to analyze. NOT for discovering new information or searching the web.',
    category: 'DATA',
    section: 'core',
  },
  {
    id: 'deslop',
    name: 'Deslop',
    description:
      'Humanize/paraphrase AI-generated text to sound more natural. ONLY when the user explicitly asks to rewrite, humanize, or de-AI-ify specific text they provide. NOT for answering questions or doing research.',
    category: 'CONTENT',
    section: 'core',
  },
  {
    id: 'academic-review',
    name: 'Academic Review',
    description:
      'Literature review, scientific consensus, peer-reviewed research. ONLY for questions about scientific findings, medical evidence, or academic consensus. NOT for practical advice, business strategy, or general knowledge.',
    category: 'RESEARCH',
    section: 'other',
  },
  {
    id: 'social-pulse',
    name: 'Social Pulse',
    description:
      'Sentiment analysis, trending discourse, "what are people saying about X". ONLY for questions about public opinion, social media trends, or community sentiment. NOT for factual research or personal advice.',
    category: 'SOCIAL',
    section: 'other',
  },
  {
    id: 'market-intel',
    name: 'Market Intel',
    description:
      'Stocks, crypto, currency exchange, market outlook, financial securities analysis. ONLY for questions about specific tickers (AAPL, BTC), asset prices, or financial market data. NOT for business strategy, freelance pricing, career planning, personal finance advice, or general entrepreneurship questions.',
    category: 'FINANCE',
    section: 'other',
  },
  {
    id: 'media-scout',
    name: 'Media Scout',
    description:
      'Discover videos, music, movies, TV shows, podcasts. ONLY for "recommend me", "find me", "what to watch/listen to" requests about specific media content. NOT for general information or research.',
    category: 'MEDIA',
    section: 'other',
  },
  {
    id: 'local-guide',
    name: 'Local Guide',
    description:
      'Places, trip planning, weather, flights, nearby searches. ONLY for location-specific questions about travel, navigation, or local discovery. NOT for general advice or non-geographic questions.',
    category: 'LOCAL',
    section: 'other',
  },
  {
    id: 'image-generation',
    name: 'Image Generation',
    description:
      'Generate images from text descriptions. ONLY when the user explicitly asks to create, generate, draw, or make an image/picture/illustration. NOT for describing images, analyzing images, or general conversation.',
    category: 'MEDIA',
    section: 'other',
  },
  {
    id: 'image-editing',
    name: 'Image Editing',
    description:
      'Edit existing images — change colors, add/remove objects, inpaint, modify specific elements. ONLY when the user explicitly asks to edit, modify, change, or alter an existing image. NOT for generating new images from scratch.',
    category: 'MEDIA',
    section: 'other',
  },
];
