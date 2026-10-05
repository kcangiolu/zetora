import { describe, it, expect, vi } from 'vitest';

// 'zetora-default' is only registered when XAI_API_KEY is set, and the provider
// registry is built at import time — set it before ai/providers is loaded so the
// test doesn't depend on the local .env.
vi.hoisted(() => {
  process.env.XAI_API_KEY = 'test-xai-key';
});

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
