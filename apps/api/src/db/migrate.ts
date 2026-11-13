/** Forward/back SQL migrations behind an advisory lock (06 §6). Runs as the owner role. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { REPO_ROOT } from '../config.js';

const DIR = join(REPO_ROOT, 'apps', 'api', 'migrations');
const LOCK = 720_104;

export async function migrate(ownerUrl: string, direction: 'up' | 'down' = 'up', log = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const names = [...new Set(readdirSync(DIR).filter((f) => f.endsWith('.up.sql')).map((f) => f.replace('.up.sql', '')))].sort();
    const todo = direction === 'up' ? names.filter((n) => !done.has(n)) : names.filter((n) => done.has(n)).reverse().slice(0, 1);
    for (const name of todo) {
      const sql = readFileSync(join(DIR, `${name}.${direction}.sql`), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        if (direction === 'up') await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        else await client.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
        await client.query('COMMIT');
        log(`migration ${direction}: ${name}`);
        applied.push(name);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${name} (${direction}) failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => undefined);
    await client.end();
  }
  return applied;
}
