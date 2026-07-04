import { describe, it, expect } from 'vitest';
import { parseCustomModelId, type CustomProviderConfig } from '@/lib/custom-providers';

const providers: CustomProviderConfig[] = [
  { id: 'prov1', name: 'Provider One', baseURL: 'https://one.example/v1' },
  { id: 'prov2', name: 'Provider Two', baseURL: 'https://two.example/v1' },
];

describe('parseCustomModelId', () => {
  it('returns null for ids without the custom- prefix', () => {
    expect(parseCustomModelId('gpt-4o', providers)).toBeNull();
  });

  it('resolves the provider and model name', () => {
    const parsed = parseCustomModelId('custom-prov1-llama3.1', providers);
    expect(parsed?.provider.id).toBe('prov1');
    expect(parsed?.modelName).toBe('llama3.1');
  });

  it('keeps hyphens inside the model name', () => {
    const parsed = parseCustomModelId('custom-prov2-qwen2.5-coder', providers);
    expect(parsed?.provider.id).toBe('prov2');
    expect(parsed?.modelName).toBe('qwen2.5-coder');
  });

  it('returns null when no provider id matches', () => {
    expect(parseCustomModelId('custom-unknown-model', providers)).toBeNull();
  });
});
