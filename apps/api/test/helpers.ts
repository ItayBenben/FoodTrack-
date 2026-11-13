import pg from 'pg';
import { hash } from '@node-rs/argon2';
import { boot } from '../src/boot';
import { buildApp, type Deps } from '../src/app';
import { migrate } from '../src/db/migrate';
import { seedFoods } from '../src/db/seed-foods';
import { anonymous } from '../src/db/pool';
import { ALG, checksum, generateKey, wrapDek } from '../src/crypto/envelope';
import { ARGON2 } from '../src/services/auth';

export const OWNER_URL = process.env.TEST_DATABASE_OWNER_URL ?? 'postgres://foodtrack:foodtrack@localhost:5432/foodtrack_test';
export const APP_URL = process.env.TEST_DATABASE_URL ?? 'postgres://foodtrack_app:foodtrack_app@localhost:5432/foodtrack_test';
export const TEST_KEK = Buffer.from(generateKey()).toString('base64');

export async function resetDatabase() {
  const c = new pg.Client({ connectionString: OWNER_URL });
  await c.connect();
  await c.query(`DROP TABLE IF EXISTS schema_migrations`);
  await c.end();
  try { await migrate(OWNER_URL, 'down', () => undefined); } catch { /* fresh db */ }
  const c2 = new pg.Client({ connectionString: OWNER_URL });
  await c2.connect();
  // drop everything owned, for a truly fresh start
  await c2.query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname='public' LOOP EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I CASCADE', r.matviewname); END LOOP;
    FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' LOOP EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', r.viewname); END LOOP;
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename); END LOOP;
    FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.f); END LOOP;
  END $$;`);
  await c2.end();
  await migrate(OWNER_URL, 'up', () => undefined);
}

export async function installKeys(kek = TEST_KEK) {
  const c = new pg.Client({ connectionString: OWNER_URL });
  await c.connect();
  const k = new Uint8Array(Buffer.from(kek, 'base64'));
  const wrapped = wrapDek(k, generateKey());
  await c.query('DELETE FROM crypto_key');
  await c.query('INSERT INTO crypto_key (id, dek_wrapped, alg, checksum) VALUES (1,$1,$2,$3)', [Buffer.from(wrapped), ALG, checksum(k, wrapped)]);
  await c.end();
}

export async function freshDeps(overrides: Record<string, string> = {}): Promise<Deps> {
  await resetDatabase();
  await installKeys();
  await seedFoods(OWNER_URL);
  return boot({ NODE_ENV: 'test', DATABASE_URL: APP_URL, DATABASE_OWNER_URL: OWNER_URL, FOODTRACK_KEK: TEST_KEK, MEDIA_DIR: '/tmp/foodtrack-test-media', ANALYSIS_URL: 'http://127.0.0.1:9', ...overrides }, { migrate: false });
}

export async function createUser(deps: Deps, passphrase = 'correct horse battery staple', email: string | null = null): Promise<string> {
  return anonymous(deps.db, async (tx) => (await tx.query<{ id: string }>('SELECT auth_create_user($1,$2,$3,$4,$5) AS id',
    [email, await hash(passphrase, ARGON2), 'Test', 'en-US', 'Asia/Jerusalem'])).rows[0]!.id);
}

export async function testApp(deps: Deps) { const app = await buildApp(deps); await app.ready(); return app; }

export async function refreshDerived() {
  const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect(); await c.query('SELECT refresh_derived()'); await c.end();
}
