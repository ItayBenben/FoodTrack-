/** Test-only: wipe the target database, migrate, install keys from FOODTRACK_KEK, seed foods. Refuses in production. */
import pg from 'pg';
import { loadEnv } from '../config.js';
import { migrate } from '../db/migrate.js';
import { seedFoods } from '../db/seed-foods.js';
import { ALG, checksum, generateKey, parseKek, wrapDek } from '../crypto/envelope.js';

const env = loadEnv();
if (env.NODE_ENV === 'production' || !/_(e2e|test)$/.test(new URL(env.DATABASE_OWNER_URL).pathname)) {
  console.error('e2e-reset only runs against a database whose name ends in _e2e or _test'); process.exit(1);
}
const c = new pg.Client({ connectionString: env.DATABASE_OWNER_URL });
await c.connect();
await c.query(`DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname='public' LOOP EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I CASCADE', r.matviewname); END LOOP;
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' LOOP EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', r.viewname); END LOOP;
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename); END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.f); END LOOP;
END $$;`);
await c.end();
await migrate(env.DATABASE_OWNER_URL, 'up', () => undefined);
const kek = parseKek(env.FOODTRACK_KEK);
const wrapped = wrapDek(kek, generateKey());
const c2 = new pg.Client({ connectionString: env.DATABASE_OWNER_URL }); await c2.connect();
await c2.query('INSERT INTO crypto_key (id, dek_wrapped, alg, checksum) VALUES (1,$1,$2,$3)', [Buffer.from(wrapped), ALG, checksum(kek, wrapped)]);
await c2.end();
await seedFoods(env.DATABASE_OWNER_URL);
console.log('e2e database ready');
