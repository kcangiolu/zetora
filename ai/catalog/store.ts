import 'server-only';

import { maindb } from '@/lib/db';
import { modelCatalogSource } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';
import { buildCatalog, modelKey, type RouteAvailability } from './build';
import { HOSTS, LABS, type HostId } from './config';
import { isConfigured } from './env';
import type { CatalogEntry, ModelsDevData } from './types';

const log = createLogger('model-catalog');

const SOURCE_ID = 'models.dev';
const SOURCE_URL = 'https://models.dev/api.json';
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
// While there is no catalog at all, wait this long between failed fetches.
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

// Only these models.dev providers are kept: the full file is several MB.
const SOURCES = new Set([
  ...LABS.flatMap((lab) => (lab.catalog ? [lab.catalog.source] : [])),
  ...HOSTS.map((host) => host.source),
]);

interface CatalogState {
  entries: CatalogEntry[];
  byId: Map<string, CatalogEntry>;
  // Lab-scoped modelKey -> entry, so an id spelled differently still resolves.
  byKey: Map<string, CatalogEntry>;
  fetchedAt: Date | null;
  lastAttemptAt: number;
  lastError: string | null;
  loading: Promise<void> | null;
  timer: NodeJS.Timeout | null;
}

// Must live on globalThis: route bundles each get their own module instance.
function state(): CatalogState {
  const store = globalThis as unknown as { __zetoraModelCatalog?: CatalogState };
  store.__zetoraModelCatalog ??= {
    entries: [],
    byId: new Map(),
    byKey: new Map(),
    fetchedAt: null,
    lastAttemptAt: 0,
    lastError: null,
    loading: null,
    timer: null,
  };
  return store.__zetoraModelCatalog;
}

function getRouteAvailability(): RouteAvailability {
  return {
    direct: new Set(
      LABS.filter((lab) => lab.direct && isConfigured(process.env[lab.direct.envKey])).map((lab) => lab.id),
    ),
    hosts: new Set<HostId>(
      HOSTS.filter((host) => host.envKeys.some((key) => isConfigured(process.env[key]))).map((host) => host.id),
    ),
  };
}

function lookupKey(lab: string, model: string): string {
  return `${lab}:${modelKey(model)}`;
}

function install(data: ModelsDevData, fetchedAt: Date): void {
  const entries = buildCatalog(data, getRouteAvailability());
  const current = state();
  current.entries = entries;
  current.byId = new Map(entries.map((entry) => [entry.id, entry]));
  current.byKey = new Map(entries.map((entry) => [lookupKey(entry.lab, entry.id.slice(entry.lab.length + 1)), entry]));
  current.fetchedAt = fetchedAt;
}

async function fetchSource(): Promise<ModelsDevData> {
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`models.dev responded ${response.status}`);
  const all = (await response.json()) as ModelsDevData;
  return Object.fromEntries(Object.entries(all).filter(([id]) => SOURCES.has(id)));
}

async function refresh(): Promise<void> {
  const current = state();
  current.lastAttemptAt = Date.now();
  try {
    const data = await fetchSource();
    const fetchedAt = new Date();
    await maindb
      .insert(modelCatalogSource)
      .values({ id: SOURCE_ID, data, fetchedAt })
      .onConflictDoUpdate({ target: modelCatalogSource.id, set: { data, fetchedAt } });
    install(data, fetchedAt);
    current.lastError = null;
    log.info(`Model catalog refreshed: ${current.entries.length} models`);
  } catch (error) {
    current.lastError = error instanceof Error ? error.message : String(error);
    log.error(`Model catalog refresh failed: ${current.lastError}`);
  }
}

async function loadStored(): Promise<void> {
  try {
    const [row] = await maindb.select().from(modelCatalogSource).limit(1);
    if (row) install(row.data, row.fetchedAt);
  } catch (error) {
    log.error(`Could not read the stored model catalog: ${error instanceof Error ? error.message : error}`);
  }
}

function canRetry(current: CatalogState): boolean {
  return Date.now() - current.lastAttemptAt > RETRY_INTERVAL_MS;
}

// Makes sure a catalog is loaded: the stored one, or models.dev when there is
// none yet. Keeping it current is startModelCatalogRefresh's job.
export async function loadModelCatalog(): Promise<void> {
  const current = state();
  if (current.loading) return current.entries.length ? undefined : current.loading;
  if (!current.fetchedAt) {
    current.loading = loadStored().finally(() => {
      current.loading = null;
    });
    await current.loading;
  }
  if (current.entries.length || !canRetry(current)) return;
  current.loading = refresh().finally(() => {
    current.loading = null;
  });
  await current.loading;
}

// Re-reads models.dev every hour from server start, so a new model is in the
// picker without anyone having used Zetora in between. Once per process.
export function startModelCatalogRefresh(): void {
  const current = state();
  if (current.timer) return;
  current.timer = setInterval(() => void refreshModelCatalog(), REFRESH_INTERVAL_MS);
  current.timer.unref();
  const age = current.fetchedAt ? Date.now() - current.fetchedAt.getTime() : Infinity;
  if (age > REFRESH_INTERVAL_MS && canRetry(current)) void refreshModelCatalog();
}

// Fetches models.dev now, whatever the age of the current catalog.
export async function refreshModelCatalog(): Promise<void> {
  const current = state();
  if (current.loading) await current.loading;
  current.loading = refresh().finally(() => {
    current.loading = null;
  });
  await current.loading;
}

export function getCatalogEntries(): CatalogEntry[] {
  void loadModelCatalog();
  return state().entries;
}

// Resolves an id as stored anywhere (preferences, chats, localStorage), even
// spelled differently from the current catalog id.
export function getCatalogEntry(id: string): CatalogEntry | undefined {
  const current = state();
  const exact = current.byId.get(id);
  if (exact) return exact;
  const separator = id.indexOf(':');
  if (separator < 0) return undefined;
  return current.byKey.get(lookupKey(id.slice(0, separator), id.slice(separator + 1)));
}

export function getCatalogStatus(): { fetchedAt: Date | null; modelCount: number; lastError: string | null } {
  const current = state();
  return { fetchedAt: current.fetchedAt, modelCount: current.entries.length, lastError: current.lastError };
}
