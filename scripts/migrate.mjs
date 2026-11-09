// Applies db/*.sql in order, once each. Usage: DATABASE_URL=... node scripts/migrate.mjs
import postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: !/pooler|pgbouncer/i.test(url) });
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db');

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
const done = new Set((await sql`SELECT name FROM schema_migrations`).map(r => r.name));
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  if (done.has(f)) continue;
  await sql.begin(async tx => {
    await tx.unsafe(readFileSync(join(dir, f), 'utf8'));
    await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
  });
  console.log('applied', f);
}
await sql.end();
