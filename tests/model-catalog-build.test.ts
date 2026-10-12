import { describe, it, expect } from 'vitest';
import { buildCatalog, modelKey, toReasoningSpec } from '@/ai/catalog/build';
import type { HostConfig, LabConfig } from '@/ai/catalog/config';
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

const HOSTS: HostConfig[] = [
  { id: 'gateway', source: 'vercel', envKeys: [] },
  { id: 'openrouter', source: 'openrouter', envKeys: [] },
];

const ACME: LabConfig = {
  id: 'acme',
  name: 'Acme',
  catalog: { source: 'acme' },
  direct: { client: 'openai', envKey: 'ACME_API_KEY' },
  hosts: { gateway: ['acme'], openrouter: ['acme-ai'] },
};

const all = { direct: new Set(['acme']), hosts: new Set(['gateway', 'openrouter'] as const) };

function build(providers: Record<string, ModelsDevModel[]>, availability = all, labs = [ACME]) {
  return buildCatalog(data(providers), availability, { now: NOW, labs, hosts: HOSTS });
}

describe('modelKey', () => {
  it('matches ids spelled differently across hosts', () => {
    expect(modelKey('claude-sonnet-4-5')).toBe(modelKey('Claude-Sonnet-4.5'));
  });
});

describe('buildCatalog', () => {
  it('routes a model through its lab first, then each available host in order', () => {
    const [entry] = build({
      acme: [model('acme-1')],
      vercel: [model('acme/acme-1')],
      openrouter: [model('acme-ai/acme.1')],
    });
    expect(entry.id).toBe('acme:acme-1');
    expect(entry.routes).toEqual([
      { host: 'direct', modelId: 'acme-1' },
      { host: 'gateway', modelId: 'acme/acme-1' },
      { host: 'openrouter', modelId: 'acme-ai/acme.1' },
    ]);
  });

  it('only uses the routes that are configured', () => {
    const catalog = build(
      { acme: [model('acme-1'), model('acme-2')], openrouter: [model('acme-ai/acme-2')] },
      { direct: new Set(), hosts: new Set(['openrouter'] as const) },
    );
    expect(catalog.map((entry) => entry.id)).toEqual(['acme:acme-2']);
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
    expect(catalog.map((entry) => entry.id)).toEqual(['acme:kept']);
  });

  it("follows the lab's own data over a host's for a first-party model", () => {
    const catalog = build({
      acme: [model('acme-old', { status: 'deprecated' })],
      vercel: [model('acme/acme-old')],
    });
    expect(catalog).toEqual([]);
  });

  it('lets hosts add open-weight models but not their own variants', () => {
    const catalog = build({
      acme: [model('acme-1')],
      vercel: [model('acme/acme-open', { open_weights: true }), model('acme/acme-1-fast', { open_weights: false })],
    });
    expect(catalog.map((entry) => entry.id).sort()).toEqual(['acme:acme-1', 'acme:acme-open']);
  });

  it('takes every model a host lists for a lab without a first-party catalog', () => {
    const lab: LabConfig = { id: 'beta', name: 'Beta', hosts: { gateway: ['beta'] } };
    const catalog = build({ vercel: [model('beta/beta-1')] }, all, [lab]);
    expect(catalog.map((entry) => entry.id)).toEqual(['beta:beta-1']);
  });

  it('skips a direct-only lab without its key, and never adds host models to it', () => {
    const lab: LabConfig = { ...ACME, id: 'cloud', directOnly: true };
    const providers = {
      acme: [model('acme-1')],
      vercel: [model('acme/acme-1'), model('acme/extra', { open_weights: true })],
    };
    expect(build(providers, { direct: new Set(), hosts: all.hosts }, [lab])).toEqual([]);
    const [entry, ...rest] = build(providers, { direct: new Set(['cloud']), hosts: all.hosts }, [lab]);
    expect(rest).toEqual([]);
    expect(entry.routes.map((route) => route.host)).toEqual(['direct', 'gateway']);
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
      id: 'acme:acme-4',
      label: 'Acme 4',
      vision: true,
      reasoning: { toggle: true, efforts: [] },
      routes: [{ host: 'direct', modelId: 'acme-4-reasoning' }],
      instantRoutes: [{ host: 'direct', modelId: 'acme-4-non-reasoning' }],
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
      ['acme:acme-pro-2607', 'Acme Pro 2'],
      ['acme:acme-1', 'Acme 1'],
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
