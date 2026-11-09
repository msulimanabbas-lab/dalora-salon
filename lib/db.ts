import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __daloraSql: ReturnType<typeof postgres> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, {
    max: 5,
    // pooled connections (Neon "-pooler", PgBouncer) run in transaction mode: no server-side prepared statements
    prepare: !/pooler|pgbouncer/i.test(url),
    onnotice: () => {},
    types: {
      // numeric comes back as a JS number (money values here are well inside double precision)
      // date stays a plain YYYY-MM-DD string (business days are calendar days, not instants)
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}

export const sql = globalThis.__daloraSql ?? (globalThis.__daloraSql = create());
export type Tx = postgres.TransactionSql;

/** Postgres error code for an exclusion-constraint violation (our double-booking guard). */
export const EXCLUSION_VIOLATION = '23P01';
export function pgCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}
