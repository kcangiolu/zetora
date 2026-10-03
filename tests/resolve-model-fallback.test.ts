import { describe, it, expect } from 'vitest';
import { resolveModel, zetora } from '@/ai/providers';

describe('resolveModel', () => {
  it('falls back to the default model for a retired built-in model id', async () => {
    const resolved = await resolveModel('zetora-retired-model');
    expect(resolved).toBe(zetora.languageModel('zetora-default'));
  });

  it("falls back to 'zetora-default' when the default-model preference is itself retired", async () => {
    const resolved = await resolveModel('zetora-retired-model', { 'zetora-default-model': 'zetora-retired-default' });
    expect(resolved).toBe(zetora.languageModel('zetora-default'));
  });
});
