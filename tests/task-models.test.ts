import { afterEach, describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';

const ENTRIES: CatalogEntry[] = [
  {
    id: 'acme:big',
    lab: 'acme',
    label: 'Big',
    description: '',
    vision: true,
    pdf: false,
    structuredOutput: true,
    reasoning: null,
    routes: [{ host: 'direct', modelId: 'big' }],
  },
];

vi.mock('@/ai/catalog/store', () => ({
  getCatalogEntry: (id: string) => ENTRIES.find((e) => e.id === id),
}));

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
    vi.stubEnv('ZETORA_MODEL_CHAT_TITLE', 'acme:big');
    expect(getTaskModel('chat-title', { 'zetora-tertiary-chat-title-model': 'custom-x-y' })).toBe('custom-x-y');
    expect(getTaskModel('chat-title', {})).toBe('acme:big');
  });

  it("never borrows another task's model", () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'acme:big');
    vi.stubEnv('ZETORA_MODEL_VOICE', '');
    expect(() => getTaskModel('voice', {})).toThrow(ModelUnavailableError);
    expect(() => getTaskModel('voice', {})).toThrow('set ZETORA_MODEL_VOICE');
  });

  it('fails when the variable names a model the catalog cannot reach', () => {
    vi.stubEnv('ZETORA_MODEL_FOLLOWUP', 'acme:retired');
    expect(() => getTaskModel('followup', {})).toThrow('ZETORA_MODEL_FOLLOWUP=acme:retired is not available');
  });

  it('accepts the internal router model for the auto router', () => {
    vi.stubEnv('ZETORA_MODEL_AUTO_ROUTER', 'zetora-arch-router');
    expect(getTaskModel('auto-router', {})).toBe('zetora-arch-router');
  });

  it('has no instance model for memory', () => {
    expect(() => getTaskModel('memory-curator', {})).toThrow('Pick one in Settings → AI Models.');
  });
});

describe('getTaskModelIds', () => {
  it('reports every task, null when unset', () => {
    vi.stubEnv('ZETORA_MODEL_VOICE', 'acme:big');
    vi.stubEnv('ZETORA_MODEL_LANG_DETECT', '');
    const ids = getTaskModelIds();
    expect(ids.voice).toBe('acme:big');
    expect(ids['lang-detect']).toBeNull();
    expect(Object.keys(ids)).toHaveLength(14);
  });
});

describe('getUnavailableTaskModels', () => {
  it('reports variables naming a model the catalog cannot reach', () => {
    vi.stubEnv('ZETORA_MODEL_VOICE', 'acme:big');
    vi.stubEnv('ZETORA_MODEL_FOLLOWUP', 'acme:retired');
    expect(getUnavailableTaskModels()).toEqual({ followup: 'acme:retired' });
  });
});
