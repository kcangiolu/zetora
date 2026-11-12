// One-off rewrite of the model ids stored in the database to the
// `provider:model` form. Stored ids name a lab's model (`alibaba:qwen3.8-27b`)
// or one of the older `zetora-*` names; each becomes the model of the
// provider that served it: the lab's own API when the instance has its key,
// else the first aggregator listing the model, in ai/catalog/config.ts order.
//
// Rewrites message.model, and in user preferences the task models, the
// favorites, the model order and the auto-router routes. An id that maps to
// nothing in the catalog is left as it is and listed.
//
// The catalog is built from the target database's own models.dev snapshot.
// --providers names the providers the target instance has an API key for,
// since this machine's environment says nothing about another instance's:
//   DATABASE_URL=... pnpm exec tsx scripts/migrate-model-ids.ts --providers=openai,anthropic [--dry-run]
import { Client } from 'pg';
import { pathToFileURL } from 'node:url';
import { buildCatalog, modelKey } from '@/ai/catalog/build';
import { PROVIDERS, type ProviderId } from '@/ai/catalog/config';
import type { CatalogEntry, ModelsDevData } from '@/ai/catalog/types';
import { ARCH_ROUTER_MODEL, AUTO_MODEL_ID, DEFAULT_MODEL_ALIAS, canonicalModelId } from '@/ai/models/helpers';
import { TERTIARY_TASKS, getTaskPreferenceKey } from '@/ai/models/tasks';

// The model name without the provider, nor an aggregator's `vendor/` prefix.
function bareModelName(entry: CatalogEntry): string {
  const name = entry.id.slice(entry.provider.length + 1);
  return name.slice(name.indexOf('/') + 1);
}

// The current id of a stored one; unchanged when it needs no rewrite, null
// when the catalog has no such model.
export function translateModelId(id: string, catalog: CatalogEntry[]): string | null {
  if (id === DEFAULT_MODEL_ALIAS || id === AUTO_MODEL_ID || id === ARCH_ROUTER_MODEL.id || id.startsWith('custom-')) {
    return id;
  }
  const stored = canonicalModelId(id);
  if (catalog.some((entry) => entry.id === stored)) return stored;
  const separator = stored.indexOf(':');
  if (separator < 0) return null;
  const prefix = stored.slice(0, separator);
  const key = modelKey(stored.slice(separator + 1));
  const matches = (entry: CatalogEntry) => modelKey(bareModelName(entry)) === key;
  // The catalog lists the labs' own APIs before the aggregators: the order
  // stored ids were served in.
  const match =
    catalog.find((entry) => entry.provider === prefix && matches(entry)) ??
    catalog.find((entry) => entry.lab === prefix && matches(entry));
  return match?.id ?? null;
}

type Preferences = Record<string, unknown>;

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

const TASK_KEYS = TERTIARY_TASKS.map(getTaskPreferenceKey);
const LIST_KEYS = ['zetora-preferred-models', 'zetora-model-order-global'];
const AUTO_ROUTER_KEY = 'zetora-auto-router-config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The preferences with every model id rewritten by `translate`.
export function translatePreferences(preferences: Preferences, translate: (id: string) => string): Preferences {
  const next: Preferences = { ...preferences };
  for (const key of TASK_KEYS) {
    const value = next[key];
    if (typeof value === 'string' && value) next[key] = translate(value);
  }
  for (const key of LIST_KEYS) {
    const value = next[key];
    if (Array.isArray(value)) {
      next[key] = [...new Set(value.map((item) => (typeof item === 'string' ? translate(item) : item)))];
    }
  }
  const autoRouter = next[AUTO_ROUTER_KEY];
  if (isRecord(autoRouter) && Array.isArray(autoRouter.routes)) {
    next[AUTO_ROUTER_KEY] = {
      ...autoRouter,
      routes: autoRouter.routes.map((route) =>
        isRecord(route) && typeof route.model === 'string' ? { ...route, model: translate(route.model) } : route,
      ),
    };
  }
  return next;
}

function parseProviders(argv: string[]): Set<ProviderId> {
  const value = argv.find((arg) => arg.startsWith('--providers='))?.slice('--providers='.length);
  if (!value) throw new Error('--providers is required: the providers the target instance has an API key for.');
  const providers = new Set<ProviderId>();
  for (const id of value.split(',')) {
    const provider = PROVIDERS.find((entry) => entry.id === id.trim());
    if (!provider) throw new Error(`Unknown provider "${id}". Known: ${PROVIDERS.map((p) => p.id).join(', ')}.`);
    providers.add(provider.id);
  }
  return providers;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const providers = parseProviders(process.argv);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required: the database to rewrite.');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const source = await client.query<{ data: ModelsDevData }>(
      "SELECT data FROM model_catalog_source WHERE id = 'models.dev'",
    );
    if (!source.rows[0]) throw new Error('This database has no models.dev snapshot: start the app once first.');
    const catalog = buildCatalog(source.rows[0].data, providers);
    print(`Catalog: ${catalog.length} models from ${[...providers].join(', ')}`);

    const changes = new Map<string, string>();
    const unknown = new Set<string>();
    const translate = (id: string): string => {
      const next = translateModelId(id, catalog);
      if (next === null) {
        unknown.add(id);
        return id;
      }
      if (next !== id) changes.set(id, next);
      return next;
    };

    await client.query('BEGIN');
    const messageModels = await client.query<{ model: string; count: string }>(
      'SELECT model, count(*) AS count FROM message WHERE model IS NOT NULL GROUP BY model',
    );
    let messages = 0;
    for (const { model, count } of messageModels.rows) {
      const next = translate(model);
      if (next === model) continue;
      await client.query('UPDATE message SET model = $1 WHERE model = $2', [next, model]);
      messages += Number(count);
    }

    const preferenceRows = await client.query<{ id: string; preferences: Preferences }>(
      'SELECT id, preferences FROM user_preferences',
    );
    let users = 0;
    for (const row of preferenceRows.rows) {
      const next = translatePreferences(row.preferences, translate);
      if (JSON.stringify(next) === JSON.stringify(row.preferences)) continue;
      await client.query('UPDATE user_preferences SET preferences = $1 WHERE id = $2', [JSON.stringify(next), row.id]);
      users += 1;
    }

    for (const [from, to] of [...changes].sort()) print(`  ${from} -> ${to}`);
    for (const id of [...unknown].sort()) print(`  ${id}: not in the catalog, left as it is`);
    print(`${messages} messages and the preferences of ${users} users ${dryRun ? 'would change' : 'changed'}.`);
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // A refused connection is an AggregateError whose own message is empty.
    const message = error instanceof AggregateError ? error.errors.map(String).join('\n') : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
