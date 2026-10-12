// Turns models.dev's data into Zetora's model catalog: one entry per lab
// model that at least one configured route can reach. Pure — no I/O, no env.
import { HOSTS, LABS, type HostConfig, type HostId, type LabConfig } from './config';
import {
  EFFORT_LEVELS,
  type CatalogEntry,
  type CatalogRoute,
  type ModelsDevData,
  type ModelsDevModel,
  type ReasoningSpec,
} from './types';

export interface RouteAvailability {
  // Lab ids whose own API is configured.
  direct: ReadonlySet<string>;
  hosts: ReadonlySet<HostId>;
}

// Model ids are spelled differently from host to host
// (claude-sonnet-4-5 vs anthropic/claude-sonnet-4.5): they match on this key.
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
  id: string;
  meta: ModelsDevModel;
  routes: CatalogRoute[];
}

function collectLabCandidates(
  lab: LabConfig,
  data: ModelsDevData,
  availability: RouteAvailability,
  hosts: HostConfig[],
  oldestReleaseDate: string,
): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  // Every first-party model, listed or not: the lab's own data decides
  // whether such a model is current, whatever a host still says about it.
  const firstPartyKeys = new Set<string>();
  const hasDirect = availability.direct.has(lab.id);

  if (lab.catalog) {
    for (const model of Object.values(data[lab.catalog.source]?.models ?? {})) {
      if (lab.catalog.include && !lab.catalog.include.test(model.id)) continue;
      const key = modelKey(model.id);
      firstPartyKeys.add(key);
      if (!isUsable(model) || !isRecent(model, oldestReleaseDate)) continue;
      candidates.set(key, {
        id: model.id,
        meta: model,
        routes: hasDirect ? [{ host: 'direct', modelId: model.id }] : [],
      });
    }
  }

  for (const host of hosts) {
    const prefixes = lab.hosts[host.id];
    if (!prefixes || !availability.hosts.has(host.id)) continue;
    for (const model of Object.values(data[host.source]?.models ?? {})) {
      const slash = model.id.indexOf('/');
      if (slash < 0 || !prefixes.includes(model.id.slice(0, slash)) || !isUsable(model)) continue;
      const localId = model.id.slice(slash + 1);
      const key = modelKey(localId);
      const route: CatalogRoute = { host: host.id, modelId: model.id };
      const existing = candidates.get(key);
      if (existing) {
        existing.routes.push(route);
        continue;
      }
      // A host adds a model of its own only when the lab has no first-party
      // list, or for open-weight models, which labs don't serve themselves —
      // never host-specific products (priority tiers, renamed aliases).
      const hostMayAdd = !lab.directOnly && (!lab.catalog || model.open_weights === true);
      if (hostMayAdd && !firstPartyKeys.has(key) && isRecent(model, oldestReleaseDate)) {
        candidates.set(key, { id: localId, meta: model, routes: [route] });
      }
    }
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

function toEntry(lab: LabConfig, candidate: Candidate): CatalogEntry {
  const { meta } = candidate;
  const input = meta.modalities?.input ?? [];
  return {
    id: `${lab.id}:${candidate.id}`,
    lab: lab.id,
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
    routes: candidate.routes,
  };
}

function mergePairs(lab: LabConfig, candidates: Map<string, Candidate>): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const consumed = new Set<string>();

  for (const [key, candidate] of candidates) {
    for (const [thinkingSuffix, instantSuffix] of PAIR_SUFFIXES) {
      if (!key.endsWith(thinkingSuffix) || key.endsWith(instantSuffix)) continue;
      const base = key.slice(0, -thinkingSuffix.length);
      const instant = candidates.get(base + instantSuffix);
      if (!instant || !instant.routes.length) continue;

      const entry = toEntry(lab, { ...candidate, id: stripPairSuffix(candidate.id, thinkingSuffix) });
      entry.label = entry.label.replace(PAIR_LABEL_SUFFIX, '');
      entry.reasoning = { ...(entry.reasoning ?? { efforts: [] }), toggle: true };
      entry.instantRoutes = instant.routes;
      entry.vision = entry.vision && instant.meta.modalities?.input?.includes('image') === true;
      entries.push(entry);
      consumed.add(key).add(base + instantSuffix);
      break;
    }
  }

  for (const [key, candidate] of candidates) {
    if (!consumed.has(key)) entries.push(toEntry(lab, candidate));
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
  availability: RouteAvailability,
  { now = new Date(), labs = LABS, hosts = HOSTS }: { now?: Date; labs?: LabConfig[]; hosts?: HostConfig[] } = {},
): CatalogEntry[] {
  const oldestReleaseDate = monthsBefore(now, MAX_MODEL_AGE_MONTHS);
  const catalog: CatalogEntry[] = [];
  for (const lab of labs) {
    if (lab.directOnly && !availability.direct.has(lab.id)) continue;
    const candidates = collectLabCandidates(lab, data, availability, hosts, oldestReleaseDate);
    for (const [key, candidate] of candidates) {
      if (!candidate.routes.length) candidates.delete(key);
    }
    const entries = dedupe(mergePairs(lab, candidates));
    entries.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.label.localeCompare(b.label));
    catalog.push(...entries);
  }
  return catalog;
}
