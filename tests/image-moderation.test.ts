import { afterEach, describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';

const BASE_ENTRY: CatalogEntry = {
  id: 'acme:eyes',
  lab: 'acme',
  label: 'Eyes',
  description: '',
  vision: true,
  pdf: false,
  structuredOutput: true,
  reasoning: null,
  routes: [{ host: 'direct', modelId: 'eyes' }],
};
const ENTRIES: CatalogEntry[] = [BASE_ENTRY, { ...BASE_ENTRY, id: 'acme:blind', label: 'Blind', vision: false }];

vi.mock('@/ai/catalog/store', () => ({
  getCatalogEntry: (id: string) => ENTRIES.find((e) => e.id === id),
}));
vi.mock('@/ai/providers', () => ({ resolveModel: vi.fn() }));
vi.mock('@/lib/net/attachment-fetch', () => ({ fetchAttachment: vi.fn() }));

import { ModelUnavailableError } from '@/ai/catalog/task-models';
import { getImageModerationModelId, parseModerationAnswer } from '@/lib/image-moderation';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getImageModerationModelId', () => {
  it('is off when the variable is empty', () => {
    vi.stubEnv('ZETORA_MODEL_IMAGE_MODERATION', '');
    expect(getImageModerationModelId()).toBeUndefined();
  });

  it('returns the configured vision model', () => {
    vi.stubEnv('ZETORA_MODEL_IMAGE_MODERATION', 'acme:eyes');
    expect(getImageModerationModelId()).toBe('acme:eyes');
  });

  it('rejects a model the catalog cannot reach', () => {
    vi.stubEnv('ZETORA_MODEL_IMAGE_MODERATION', 'acme:retired');
    expect(() => getImageModerationModelId()).toThrow(ModelUnavailableError);
  });

  it('rejects a model without vision', () => {
    vi.stubEnv('ZETORA_MODEL_IMAGE_MODERATION', 'acme:blind');
    expect(() => getImageModerationModelId()).toThrow('cannot read images');
  });
});

describe('parseModerationAnswer', () => {
  it('reads a safe answer', () => {
    expect(parseModerationAnswer('safe')).toEqual({ safe: true });
    expect(parseModerationAnswer('**Safe.**\n')).toEqual({ safe: true });
  });

  it('reads a chat model unsafe answer with its category', () => {
    expect(parseModerationAnswer('unsafe: graphic violence')).toEqual({ safe: false, category: 'graphic violence' });
  });

  it('reads a guard model answer with the category on the next line', () => {
    expect(parseModerationAnswer('unsafe\nS11')).toEqual({ safe: false, category: 'S11' });
  });

  it('names an unsafe answer without a category', () => {
    expect(parseModerationAnswer('UNSAFE')).toEqual({ safe: false, category: 'unspecified' });
  });

  it('rejects any other answer instead of letting the image through', () => {
    expect(() => parseModerationAnswer('The image shows a cat.')).toThrow('unexpected answer');
    expect(() => parseModerationAnswer('')).toThrow('unexpected answer');
  });
});
