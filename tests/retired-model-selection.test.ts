import { describe, expect, it } from 'vitest';
import { AUTO_MODEL_ID, DEFAULT_MODEL_ALIAS, isRetiredModelSelection, type Model } from '@/ai/models';

const model = { value: 'acme:big', provider: 'acme' } as Pick<Model, 'value' | 'provider'>;
const catalog = [model] as Model[];

describe('isRetiredModelSelection', () => {
  it('flags a catalog model the instance no longer offers', () => {
    expect(isRetiredModelSelection('acme:gone', catalog)).toBe(true);
  });

  it('flags it on an instance with no catalog model at all', () => {
    expect(isRetiredModelSelection('acme:gone', [])).toBe(true);
  });

  it('keeps a model the catalog still has, however it is spelled', () => {
    expect(isRetiredModelSelection('acme:big', catalog)).toBe(false);
    expect(isRetiredModelSelection('acme:BIG', catalog)).toBe(false);
  });

  it('keeps the default and Auto, which are not catalog models', () => {
    expect(isRetiredModelSelection(DEFAULT_MODEL_ALIAS, catalog)).toBe(false);
    expect(isRetiredModelSelection(AUTO_MODEL_ID, catalog)).toBe(false);
  });

  it('keeps a custom model, whose provider may only be down for now', () => {
    expect(isRetiredModelSelection('custom-local-qwen3:8b', [])).toBe(false);
  });
});
