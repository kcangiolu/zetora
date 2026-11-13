import { afterEach, describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';

const ENTRIES: CatalogEntry[] = [
  {
    id: 'openai:big',
    provider: 'openai',
    modelId: 'big',
    lab: 'openai',
    label: 'Big',
    description: '',
    vision: true,
    pdf: false,
    structuredOutput: true,
    reasoning: null,
  },
];

vi.mock('@/ai/catalog/store', () => ({
  getCatalogEntry: (id: string) => ENTRIES.find((e) => e.id === id),
}));

vi.mock('@/lib/custom-providers', async (importOriginal) => {
  const { parseCustomModelId } = await importOriginal<typeof import('@/lib/custom-providers')>();
  return {
    parseCustomModelId,
    getOperatorProviders: () => [{ id: 'local', name: 'Local', baseURL: 'http://192.0.2.1/v1' }],
  };
});

import {
  getTaskModel,
  getTaskModelIds,
  getUnavailableTaskModels,
  ModelUnavailableError,
} from '@/ai/catalog/task-models';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTaskModel', () => {
  it("prefers the user's pick over the task's variable", () => {
    vi.stubEnv('ZETORA_MODEL_CHAT_TITLE', 'openai:big');
    expect(getTaskModel('chat-title', { 'zetora-tertiary-chat-title-model': 'custom-x-y' })).toBe('custom-x-y');
    expect(getTaskModel('chat-title', {})).toBe('openai:big');
  });

  it('runs a pick the catalog has', () => {
    vi.stubEnv('ZETORA_MODEL_CHAT_TITLE', 'custom-local-qwen3:8b');
    expect(getTaskModel('chat-title', { 'zetora-tertiary-chat-title-model': 'openai:big' })).toBe('openai:big');
  });

  it('refuses a pick that left the catalog instead of running the instance model', () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'openai:big');
    const preferences = { 'zetora-default-model': 'anthropic:gone' };
    expect(() => getTaskModel('default', preferences)).toThrow(ModelUnavailableError);
    expect(() => getTaskModel('default', preferences)).toThrow(
      'Default Model: your pick in Settings → AI Models, anthropic:gone, is not available',
    );
  });

  it("never borrows another task's model", () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'openai:big');
    vi.stubEnv('ZETORA_MODEL_VOICE', '');
    expect(() => getTaskModel('voice', {})).toThrow(ModelUnavailableError);
    expect(() => getTaskModel('voice', {})).toThrow('set ZETORA_MODEL_VOICE');
  });

  it('fails when the variable names a model the catalog cannot reach', () => {
    vi.stubEnv('ZETORA_MODEL_FOLLOWUP', 'openai:retired');
    expect(() => getTaskModel('followup', {})).toThrow('ZETORA_MODEL_FOLLOWUP=openai:retired is not available');
  });

  it('accepts the internal router model for the auto router', () => {
    vi.stubEnv('ZETORA_MODEL_AUTO_ROUTER', 'zetora-arch-router');
    expect(getTaskModel('auto-router', {})).toBe('zetora-arch-router');
  });

  it('accepts a model of a provider the instance declares', () => {
    vi.stubEnv('ZETORA_MODEL_CHAT_TITLE', 'custom-local-qwen3:8b');
    expect(getTaskModel('chat-title', {})).toBe('custom-local-qwen3:8b');
  });

  it('refuses a custom model whose provider the instance does not declare', () => {
    vi.stubEnv('ZETORA_MODEL_CHAT_TITLE', 'custom-someone-qwen3:8b');
    expect(() => getTaskModel('chat-title', {})).toThrow('is not in CUSTOM_AI_PROVIDERS');
  });

  it('refuses a declared provider with no model name', () => {
    vi.stubEnv('ZETORA_MODEL_CHAT_TITLE', 'custom-local-');
    expect(() => getTaskModel('chat-title', {})).toThrow('is not available');
  });

  it('has no instance model for memory', () => {
    expect(() => getTaskModel('memory-curator', {})).toThrow('Pick one in Settings → AI Models.');
  });
});

describe('getTaskModelIds', () => {
  it('reports every task, null when unset', () => {
    vi.stubEnv('ZETORA_MODEL_VOICE', 'openai:big');
    vi.stubEnv('ZETORA_MODEL_LANG_DETECT', '');
    const ids = getTaskModelIds();
    expect(ids.voice).toBe('openai:big');
    expect(ids['lang-detect']).toBeNull();
    expect(Object.keys(ids)).toHaveLength(15);
  });
});

describe('getUnavailableTaskModels', () => {
  it('reports variables naming a model the catalog cannot reach', () => {
    vi.stubEnv('ZETORA_MODEL_VOICE', 'openai:big');
    vi.stubEnv('ZETORA_MODEL_FOLLOWUP', 'openai:retired');
    vi.stubEnv('ZETORA_MODEL_ENHANCE', 'custom-someone-small');
    expect(getUnavailableTaskModels()).toEqual({ followup: 'openai:retired', enhance: 'custom-someone-small' });
  });
});
