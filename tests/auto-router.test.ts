import { describe, it, expect, beforeEach, vi } from 'vitest';

const generateText = vi.hoisted(() => vi.fn());
const getComprehensiveUserData = vi.hoisted(() => vi.fn());
const getCachedUserPreferencesByUserId = vi.hoisted(() => vi.fn());
const resolveTertiaryModel = vi.hoisted(() => vi.fn());
const hasVisionSupport = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({ generateText }));
vi.mock('@/lib/user-data-server', () => ({ getComprehensiveUserData, getCachedUserPreferencesByUserId }));
vi.mock('@/ai/tertiary', () => ({ resolveTertiaryModel }));
vi.mock('@/ai/catalog/models', () => ({ hasVisionSupport }));

import { routeWithAutoRouter } from '@/lib/search/auto-router';

const routes = [
  { name: 'coding', description: 'Programming questions', model: 'model-code' },
  { name: 'news', description: 'Current events', model: 'model-news' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getComprehensiveUserData.mockResolvedValue({ id: 'u1' });
  getCachedUserPreferencesByUserId.mockResolvedValue({ preferences: {} });
  resolveTertiaryModel.mockResolvedValue('tertiary-model');
  hasVisionSupport.mockReturnValue(true);
});

describe('routeWithAutoRouter', () => {
  it('fails when there is no user', async () => {
    getComprehensiveUserData.mockResolvedValue(null);
    expect(await routeWithAutoRouter({ query: 'q', routes })).toEqual({
      success: false,
      error: 'User not found',
    });
  });

  it('rejects empty queries and empty route lists', async () => {
    expect(await routeWithAutoRouter({ query: '   ', routes })).toEqual({
      success: false,
      error: 'Query cannot be empty',
    });
    expect(await routeWithAutoRouter({ query: 'q', routes: [{ name: ' ', description: '', model: '' }] })).toEqual({
      success: false,
      error: 'No routes configured',
    });
  });

  it('routes to the model of the matched route', async () => {
    generateText.mockResolvedValue({ text: '{"route": "coding"}' });
    expect(await routeWithAutoRouter({ query: 'write a regex', routes })).toEqual({
      success: true,
      model: 'model-code',
      route: 'coding',
    });
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ model: 'tertiary-model', temperature: 0 }));
  });

  it('repairs slightly malformed JSON around the route answer', async () => {
    generateText.mockResolvedValue({ text: 'Sure! Here you go: {"route": "news",}' });
    const result = await routeWithAutoRouter({ query: 'latest headlines', routes });
    expect(result).toMatchObject({ success: true, model: 'model-news', route: 'news' });
  });

  it('falls back to the default model when no route matches', async () => {
    generateText.mockResolvedValue({ text: '{"route": "other"}' });
    expect(await routeWithAutoRouter({ query: 'hello', routes })).toEqual({
      success: true,
      model: 'zetora-default',
      route: 'other',
    });
  });

  it('swaps to a vision-capable route when images are attached', async () => {
    generateText.mockResolvedValue({ text: '{"route": "coding"}' });
    hasVisionSupport.mockImplementation((model: string) => model === 'model-news');
    const result = await routeWithAutoRouter({ query: 'what is in this image?', routes, hasImages: true });
    expect(result).toMatchObject({ success: true, model: 'model-news' });
  });

  it('reports a generic failure when the LLM call throws', async () => {
    generateText.mockRejectedValue(new Error('boom'));
    expect(await routeWithAutoRouter({ query: 'q', routes })).toEqual({
      success: false,
      error: 'Failed to route query',
    });
  });
});
