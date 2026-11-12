import { describe, it, expect } from 'vitest';
import { buildCatalog, modelKey, toReasoningSpec } from '@/ai/catalog/build';
import type { LabConfig, ProviderConfig, ProviderId } from '@/ai/catalog/config';
import type { ModelsDevData, ModelsDevModel } from '@/ai/catalog/types';

const NOW = new Date('2026-10-12T00:00:00Z');

function model(id: string, overrides: Partial<ModelsDevModel> = {}): ModelsDevModel {
  return {
    id,
    name: id,
    tool_call: true,
    release_date: '2026-06-01',
    modalities: { input: ['text'], output: ['text'] },
    limit: { context: 200_000, output: 32_000 },
    ...overrides,
  };
}

function data(providers: Record<string, ModelsDevModel[]>): ModelsDevData {
  return Object.fromEntries(
    Object.entries(providers).map(([id, models]) => [id, { models: Object.fromEntries(models.map((m) => [m.id, m])) }]),
  );
}

const ACME_DIRECT: ProviderConfig = { id: 'openai', name: 'Acme', source: 'acme', envKeys: [], lab: 'acme' };
const PROVIDERS: ProviderConfig[] = [
  ACME_DIRECT,
  { id: 'gateway', name: 'Gateway', source: 'vercel', envKeys: [] },
  { id: 'openrouter', name: 'OpenRouter', source: 'openrouter', envKeys: [] },
];
const LABS: LabConfig[] = [{ id: 'acme', name: 'Acme', vendors: ['acme', 'acme-ai'] }];

const ALL = new Set<ProviderId>(['openai', 'gateway', 'openrouter']);

function build(sources: Record<string, ModelsDevModel[]>, configured = ALL, providers = PROVIDERS) {
  return buildCatalog(data(sources), configured, { now: NOW, providers, labs: LABS });
}

describe('modelKey', () => {
  it('matches ids spelled differently', () => {
    expect(modelKey('claude-sonnet-4-5')).toBe(modelKey('Claude-Sonnet-4.5'));
  });
});

describe('buildCatalog', () => {
  it("lists a model once per provider serving it, with that provider's id and limits", () => {
    const catalog = build({
      acme: [model('acme-1')],
      vercel: [model('acme/acme-1', { limit: { context: 128_000, output: 8000 } })],
      openrouter: [model('acme-ai/acme.1')],
    });
    expect(catalog.map((entry) => [entry.id, entry.provider, entry.modelId, entry.lab, entry.contextWindow])).toEqual([
      ['openai:acme-1', 'openai', 'acme-1', 'acme', 200_000],
      ['gateway:acme/acme-1', 'gateway', 'acme/acme-1', 'acme', 128_000],
      ['openrouter:acme-ai/acme.1', 'openrouter', 'acme-ai/acme.1', 'acme', 200_000],
    ]);
  });

  it('only lists the providers that are configured', () => {
    const catalog = build(
      { acme: [model('acme-1')], openrouter: [model('acme-ai/acme-2')] },
      new Set<ProviderId>(['openrouter']),
    );
    expect(catalog.map((entry) => entry.id)).toEqual(['openrouter:acme-ai/acme-2']);
  });

  it('leaves out aggregator models of a lab it does not know', () => {
    const catalog = build({ vercel: [model('acme/acme-1'), model('other/model-1'), model('no-vendor')] });
    expect(catalog.map((entry) => entry.id)).toEqual(['gateway:acme/acme-1']);
  });

  it("keeps only the models a provider's pattern matches", () => {
    const catalog = build({ acme: [model('acme-1'), model('beta-1')] }, ALL, [{ ...ACME_DIRECT, include: /^acme-/ }]);
    expect(catalog.map((entry) => entry.id)).toEqual(['openai:acme-1']);
  });

  it('leaves out models that cannot call tools, do not output text, are retired or too old', () => {
    const catalog = build({
      acme: [
        model('no-tools', { tool_call: false }),
        model('image-out', { modalities: { input: ['text'], output: ['image'] } }),
        model('retired', { status: 'deprecated' }),
        model('old', { release_date: '2024-01-01' }),
        model('kept'),
      ],
    });
    expect(catalog.map((entry) => entry.id)).toEqual(['openai:kept']);
  });

  it('merges a thinking/instant pair into one entry with a reasoning toggle', () => {
    const [entry, ...rest] = build({
      acme: [
        model('acme-4-reasoning', {
          name: 'Acme 4 Reasoning',
          reasoning: true,
          modalities: { input: ['text', 'image'], output: ['text'] },
        }),
        model('acme-4-non-reasoning', {
          name: 'Acme 4 Non-Reasoning',
          modalities: { input: ['text', 'image'], output: ['text'] },
        }),
      ],
    });
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      id: 'openai:acme-4',
      label: 'Acme 4',
      vision: true,
      reasoning: { toggle: true, efforts: [] },
      modelId: 'acme-4-reasoning',
      instantModelId: 'acme-4-non-reasoning',
    });
  });

  it("merges a pair within an aggregator's vendor-prefixed ids", () => {
    const [entry, ...rest] = build({
      openrouter: [model('acme-ai/acme-5-thinking', { reasoning: true }), model('acme-ai/acme-5-instruct')],
    });
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      id: 'openrouter:acme-ai/acme-5',
      modelId: 'acme-ai/acme-5-thinking',
      instantModelId: 'acme-ai/acme-5-instruct',
    });
  });

  it('keeps one entry per model across snapshots and -latest aliases', () => {
    const catalog = build({
      acme: [
        model('acme-1', { name: 'Acme 1 (latest)' }),
        model('acme-1-20260601', { name: 'Acme 1' }),
        model('acme-pro-latest', { name: 'Acme Pro', release_date: '2026-07-01' }),
        model('acme-pro-2607', { name: 'Acme Pro 2', release_date: '2026-07-01' }),
      ],
    });
    expect(catalog.map((entry) => [entry.id, entry.label])).toEqual([
      ['openai:acme-pro-2607', 'Acme Pro 2'],
      ['openai:acme-1', 'Acme 1'],
    ]);
  });

  it('maps capabilities and limits', () => {
    const [entry] = build({
      acme: [
        model('acme-1', {
          modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
          limit: { context: 1_000_000, output: 64_000 },
          structured_output: true,
          status: 'beta',
        }),
      ],
    });
    expect(entry).toMatchObject({
      vision: true,
      pdf: true,
      contextWindow: 1_000_000,
      maxOutputTokens: 64_000,
      structuredOutput: true,
      status: 'beta',
      reasoning: null,
    });
  });
});

describe('toReasoningSpec', () => {
  it('reads toggle, ordered effort values and budget', () => {
    expect(
      toReasoningSpec(
        model('m', {
          reasoning: true,
          reasoning_options: [
            { type: 'toggle' },
            { type: 'effort', values: ['high', 'low', 'max', 'bogus'] },
            { type: 'budget_tokens', min: 1024 },
          ],
        }),
      ),
    ).toEqual({ toggle: true, efforts: ['low', 'high', 'max'], budget: { min: 1024, max: undefined } });
  });

  it('is null for a model that does not reason', () => {
    expect(toReasoningSpec(model('m'))).toBeNull();
  });
});
