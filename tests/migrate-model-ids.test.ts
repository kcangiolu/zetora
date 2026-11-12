import { describe, it, expect } from 'vitest';
import type { ProviderId } from '@/ai/catalog/config';
import type { CatalogEntry } from '@/ai/catalog/types';
import { translateModelId, translatePreferences } from '@/scripts/migrate-model-ids';

function entry(provider: ProviderId, modelId: string, lab: string): CatalogEntry {
  return {
    id: `${provider}:${modelId}`,
    provider,
    modelId,
    lab,
    label: modelId,
    description: '',
    vision: false,
    pdf: false,
    structuredOutput: true,
    reasoning: null,
  };
}

// In provider order, as buildCatalog lists them.
const CATALOG = [
  entry('anthropic', 'claude-sonnet-5-5', 'anthropic'),
  entry('vertex', 'gemini-3.8-flash', 'google'),
  entry('groq', 'qwen/qwen3.8-27b', 'alibaba'),
  entry('openrouter', 'qwen/qwen3.8-27b', 'alibaba'),
  entry('openrouter', 'anthropic/claude-haiku-5.5', 'anthropic'),
];

const translate = (id: string) => translateModelId(id, CATALOG);

describe('translateModelId', () => {
  it("keeps an id that is already the provider's", () => {
    expect(translate('anthropic:claude-sonnet-5-5')).toBe('anthropic:claude-sonnet-5-5');
    expect(translate('vertex:gemini-3.8-flash')).toBe('vertex:gemini-3.8-flash');
  });

  it('moves a lab model to the first aggregator serving it', () => {
    expect(translate('alibaba:qwen3.8-27b')).toBe('groq:qwen/qwen3.8-27b');
  });

  it("moves a direct lab's model to an aggregator when the lab's own API is not configured", () => {
    expect(translate('anthropic:claude-haiku-5-5')).toBe('openrouter:anthropic/claude-haiku-5.5');
  });

  it('keeps the aliases and custom models as they are', () => {
    for (const id of ['zetora-default', 'zetora-auto', 'zetora-arch-router', 'custom-local:qwen']) {
      expect(translate(id)).toBe(id);
    }
  });

  it('is null for a model no configured provider serves', () => {
    expect(translate('moonshot:kimi-k3')).toBeNull();
    expect(translate('not-an-id')).toBeNull();
  });
});

describe('translatePreferences', () => {
  const rename = (id: string) => (id === 'alibaba:qwen3.8-27b' ? 'groq:qwen/qwen3.8-27b' : id);

  it('rewrites task models, lists and auto-router routes, and nothing else', () => {
    const next = translatePreferences(
      {
        'zetora-default-model': 'alibaba:qwen3.8-27b',
        'zetora-tertiary-chat-title-model': 'anthropic:claude-sonnet-5-5',
        'zetora-preferred-models': ['alibaba:qwen3.8-27b', 'groq:qwen/qwen3.8-27b'],
        'zetora-auto-router-config': { routes: [{ name: 'code', description: 'Code', model: 'alibaba:qwen3.8-27b' }] },
        'zetora-image-gen-model': 'alibaba:qwen3.8-27b',
      },
      rename,
    );
    expect(next).toEqual({
      'zetora-default-model': 'groq:qwen/qwen3.8-27b',
      'zetora-tertiary-chat-title-model': 'anthropic:claude-sonnet-5-5',
      'zetora-preferred-models': ['groq:qwen/qwen3.8-27b'],
      'zetora-auto-router-config': { routes: [{ name: 'code', description: 'Code', model: 'groq:qwen/qwen3.8-27b' }] },
      'zetora-image-gen-model': 'alibaba:qwen3.8-27b',
    });
  });
});
