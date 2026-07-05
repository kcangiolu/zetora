import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('[migrate] ERROR: DATABASE_URL is required');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const db = drizzle(client);

  console.log('[migrate] Running Drizzle migrations...');
  await migrate(db, { migrationsFolder: join(root, 'drizzle/migrations') });
  console.log('[migrate] Drizzle migrations complete.');

  console.log('[migrate] Creating performance indexes...');
  const indexSql = readFileSync(join(root, 'create_indexes.sql'), 'utf8');
  // Each CREATE INDEX CONCURRENTLY must run outside a transaction.
  // client.query() never opens one implicitly — this is safe.
  const statements = indexSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await client.query(stmt);
  }
  console.log('[migrate] Indexes created.');
} finally {
  await client.end();
}
