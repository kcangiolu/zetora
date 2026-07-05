import { describe, it, expect } from 'vitest';
import { parseCustomModelId, toClientSafeProviders, type CustomProviderConfig } from '@/lib/custom-providers';

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

describe('toClientSafeProviders', () => {
  it('strips the apiKey and reports only its presence', () => {
    const safe = toClientSafeProviders([
      { id: 'a', name: 'A', baseURL: 'https://a.example/v1', apiKey: 'sk-super-secret' },
      { id: 'b', name: 'B', baseURL: 'https://b.example/v1' },
      { id: 'c', name: 'C', baseURL: 'https://c.example/v1', apiKey: '' },
    ]);

    expect(safe).toEqual([
      { id: 'a', name: 'A', baseURL: 'https://a.example/v1', hasApiKey: true },
      { id: 'b', name: 'B', baseURL: 'https://b.example/v1', hasApiKey: false },
      { id: 'c', name: 'C', baseURL: 'https://c.example/v1', hasApiKey: false },
    ]);
    expect(JSON.stringify(safe)).not.toContain('sk-super-secret');
  });

  it('preserves unrelated fields like disableAutoDetect', () => {
    const [safe] = toClientSafeProviders([
      { id: 'a', name: 'A', baseURL: 'https://a.example/v1', apiKey: 'k', disableAutoDetect: true },
    ]);
    expect(safe.disableAutoDetect).toBe(true);
    expect('apiKey' in safe).toBe(false);
  });
});
