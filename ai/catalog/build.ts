// Turns models.dev's data into Zetora's model catalog: one entry per model of
// each configured provider. The same model served by two providers is two
// entries, each with that provider's limits and prices. Pure — no I/O, no env.
import { LABS, PROVIDERS, type LabConfig, type ProviderConfig, type ProviderId } from './config';
import { EFFORT_LEVELS, type CatalogEntry, type ModelsDevData, type ModelsDevModel, type ReasoningSpec } from './types';

// Loose spelling of a model id (claude-sonnet-4-5 vs Claude-Sonnet-4.5), so
// an id typed by hand still resolves, and thinking/instant pairs match.
export function modelKey(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Whether a host can serve this model the way Zetora needs it: tool calls,
// text out, and not retired.
function isUsable(model: ModelsDevModel): boolean {
  const input = model.modalities?.input ?? ['text'];
  const output = model.modalities?.output ?? ['text'];
  return (
    model.tool_call === true &&
    model.status !== 'deprecated' &&
    input.includes('text') &&
    output.length === 1 &&
    output[0] === 'text' &&
    // Host-specific variants (openrouter's :free/:nitro, ~latest aliases).
    !model.id.includes(':') &&
    !model.id.startsWith('~')
  );
}

// Models older than this are left out, whoever still serves them.
const MAX_MODEL_AGE_MONTHS = 18;

function isRecent(model: ModelsDevModel, oldestReleaseDate: string): boolean {
  return !model.release_date || model.release_date >= oldestReleaseDate;
}

export function toReasoningSpec(model: ModelsDevModel): ReasoningSpec | null {
  if (!model.reasoning) return null;
  const spec: ReasoningSpec = { toggle: false, efforts: [] };
  for (const option of model.reasoning_options ?? []) {
    if (option.type === 'toggle') spec.toggle = true;
    if (option.type === 'effort') {
      spec.efforts = EFFORT_LEVELS.filter((level) => option.values.includes(level));
    }
    if (option.type === 'budget_tokens') spec.budget = { min: option.min, max: option.max };
  }
  return spec;
}

interface Candidate {
  lab: string;
  meta: ModelsDevModel;
}

// The lab behind a model: the provider's own, or for an aggregator the one
// claiming the `vendor/` prefix of its id.
function labOf(provider: ProviderConfig, modelId: string, labs: LabConfig[]): string | undefined {
  if (provider.lab) return provider.lab;
  const slash = modelId.indexOf('/');
  if (slash < 0) return undefined;
  const vendor = modelId.slice(0, slash);
  return labs.find((lab) => lab.vendors.includes(vendor))?.id;
}

function collectCandidates(
  provider: ProviderConfig,
  data: ModelsDevData,
  labs: LabConfig[],
  oldestReleaseDate: string,
): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  for (const model of Object.values(data[provider.source]?.models ?? {})) {
    if (provider.include && !provider.include.test(model.id)) continue;
    if (!isUsable(model) || !isRecent(model, oldestReleaseDate)) continue;
    const lab = labOf(provider, model.id, labs);
    if (lab) candidates.set(model.id, { lab, meta: model });
  }
  return candidates;
}

// Upstream models published as a thinking/instant pair, merged into one entry
// whose reasoning toggle picks between them.
const PAIR_SUFFIXES: [thinking: string, instant: string][] = [
  ['reasoning', 'nonreasoning'],
  ['thinking', 'instruct'],
];

const PAIR_LABEL_SUFFIX = /\s*[(-]?\s*(reasoning|thinking)\s*\)?\s*$/i;

// "Claude Haiku 4.5 (latest)", "GPT-4o (2024-11-20)": alias and snapshot
// markers, dropped so one model shows under one name.
const LABEL_ALIAS_SUFFIX = /\s*\((latest|\d{4}-\d{2}-\d{2})\)\s*$/i;

function stripPairSuffix(id: string, suffix: string): string {
  return id.replace(new RegExp(`[-_.]?${suffix}$`, 'i'), '');
}

function toEntry(provider: ProviderConfig, modelId: string, candidate: Candidate): CatalogEntry {
  const { meta } = candidate;
  const input = meta.modalities?.input ?? [];
  return {
    id: `${provider.id}:${modelId}`,
    provider: provider.id,
    modelId,
    lab: candidate.lab,
    label: meta.name.replace(LABEL_ALIAS_SUFFIX, ''),
    description: meta.description ?? '',
    releaseDate: meta.release_date,
    status: meta.status === 'alpha' || meta.status === 'beta' ? meta.status : undefined,
    vision: input.includes('image'),
    pdf: input.includes('pdf'),
    contextWindow: meta.limit?.context || undefined,
    maxOutputTokens: meta.limit?.output || undefined,
    structuredOutput: meta.structured_output === true,
    cost:
      meta.cost?.input !== undefined && meta.cost.output !== undefined
        ? { input: meta.cost.input, output: meta.cost.output }
        : undefined,
    reasoning: toReasoningSpec(meta),
  };
}

function mergePairs(provider: ProviderConfig, candidates: Map<string, Candidate>): CatalogEntry[] {
  const byKey = new Map([...candidates.keys()].map((id) => [modelKey(id), id]));
  const entries: CatalogEntry[] = [];
  const consumed = new Set<string>();

  for (const [thinkingId, candidate] of candidates) {
    const key = modelKey(thinkingId);
    for (const [thinkingSuffix, instantSuffix] of PAIR_SUFFIXES) {
      if (!key.endsWith(thinkingSuffix) || key.endsWith(instantSuffix)) continue;
      const instantId = byKey.get(key.slice(0, -thinkingSuffix.length) + instantSuffix);
      const instant = instantId && candidates.get(instantId);
      if (!instantId || !instant) continue;

      // The entry is named after the pair, but calls the thinking model.
      const entry = {
        ...toEntry(provider, stripPairSuffix(thinkingId, thinkingSuffix), candidate),
        modelId: thinkingId,
      };
      entry.label = entry.label.replace(PAIR_LABEL_SUFFIX, '');
      entry.reasoning = { ...(entry.reasoning ?? { efforts: [] }), toggle: true };
      entry.instantModelId = instantId;
      entry.vision = entry.vision && instant.meta.modalities?.input?.includes('image') === true;
      entries.push(entry);
      consumed.add(thinkingId).add(instantId);
      break;
    }
  }

  for (const [id, candidate] of candidates) {
    if (!consumed.has(id)) entries.push(toEntry(provider, id, candidate));
  }
  return entries;
}

// One model can be listed several times: snapshots sharing its display name
// (claude-haiku-4-5 / -20251001), `-latest` aliases released the same day
// as the model they point to (gemini-flash-latest / gemini-3.7-flash), and a
// merged pair landing on an id a host also uses. Keep one of each, the most
// recent release, then the shortest id.
function dedupe(entries: CatalogEntry[]): CatalogEntry[] {
  const pinnedReleaseDates = new Set(
    entries.filter((entry) => !entry.id.endsWith('-latest')).map((entry) => entry.releaseDate),
  );
  const current = entries.filter(
    (entry) => !entry.id.endsWith('-latest') || !pinnedReleaseDates.has(entry.releaseDate),
  );
  return keepPreferred(
    keepPreferred(current, (entry) => modelKey(entry.label)),
    (entry) => entry.id,
  );
}

function keepPreferred(entries: CatalogEntry[], keyOf: (entry: CatalogEntry) => string): CatalogEntry[] {
  const kept = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const existing = kept.get(key);
    if (!existing || isPreferred(entry, existing)) kept.set(key, entry);
  }
  return [...kept.values()];
}

function isPreferred(a: CatalogEntry, b: CatalogEntry): boolean {
  const dateA = a.releaseDate ?? '';
  const dateB = b.releaseDate ?? '';
  if (dateA !== dateB) return dateA > dateB;
  return a.id.length < b.id.length;
}

function monthsBefore(date: Date, months: number): string {
  const oldest = new Date(date);
  oldest.setUTCMonth(oldest.getUTCMonth() - months);
  return oldest.toISOString().slice(0, 10);
}

export function buildCatalog(
  data: ModelsDevData,
  configured: ReadonlySet<ProviderId>,
  {
    now = new Date(),
    providers = PROVIDERS,
    labs = LABS,
  }: { now?: Date; providers?: ProviderConfig[]; labs?: LabConfig[] } = {},
): CatalogEntry[] {
  const oldestReleaseDate = monthsBefore(now, MAX_MODEL_AGE_MONTHS);
  const catalog: CatalogEntry[] = [];
  for (const provider of providers) {
    if (!configured.has(provider.id)) continue;
    const entries = dedupe(mergePairs(provider, collectCandidates(provider, data, labs, oldestReleaseDate)));
    entries.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.label.localeCompare(b.label));
    catalog.push(...entries);
  }
  return catalog;
}
