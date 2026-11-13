import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Deps } from '../src/app';
import { boot } from '../src/boot';
import { withUser } from '../src/db/pool';
import { migrate } from '../src/db/migrate';
import { KeyError } from '../src/crypto/envelope';
import { createObservation } from '../src/services/observations';
import { generateFixture } from '../src/fixtures/synthetic';
import { insertFixture, loadFoodRefs } from '../src/fixtures/load';
import { REPO_ROOT } from '../src/config';
import { APP_URL, OWNER_URL, TEST_KEK, createUser, freshDeps } from './helpers';

let deps: Deps; let A: string; let B: string;

beforeAll(async () => {
  deps = await freshDeps();
  A = await createUser(deps); B = await createUser(deps, 'another long passphrase');
  const foods = await loadFoodRefs(deps.db, A);
  await insertFixture(deps, A, generateFixture(foods, { days: 30, seed: 1 }).observations);
  await insertFixture(deps, B, generateFixture(foods, { days: 10, seed: 2 }).observations);
});
afterAll(async () => { await deps?.db.end(); });

const USER_TABLES = ['observation', 'observation_value', 'observation_revision', 'meal_item', 'user_food', 'user_food_alias', 'change_log', 'safety_flag', 'inbox_item'];

describe('RLS isolation (07 M1 done-when)', () => {
  it('user B cannot read any of user A\'s rows through a raw query with the app role', async () => {
    for (const t of USER_TABLES) {
      const n = await withUser(deps.db, B, async (tx) => (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [A])).rows[0]!.n);
      expect(n, t).toBe(0);
      const own = await withUser(deps.db, A, async (tx) => (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [A])).rows[0]!.n);
      if (['observation', 'observation_value', 'meal_item', 'user_food', 'change_log'].includes(t)) expect(own, t).toBeGreaterThan(0);
    }
  });
  it('with no app.user_id set, the app role sees nothing at all', async () => {
    const c = new pg.Client({ connectionString: APP_URL }); await c.connect();
    for (const t of [...USER_TABLES, 'app_user']) expect((await c.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n, t).toBe(0);
    await c.end();
  });
  it('user B cannot update, delete or insert into user A\'s data', async () => {
    const upd = await withUser(deps.db, B, (tx) => tx.query(`UPDATE observation SET source = 'import' WHERE user_id = $1`, [A]));
    expect(upd.rowCount).toBe(0);
    const del = await withUser(deps.db, B, (tx) => tx.query(`DELETE FROM observation WHERE user_id = $1`, [A]));
    expect(del.rowCount).toBe(0);
    await expect(withUser(deps.db, B, (tx) => tx.query(
      `INSERT INTO observation (user_id, tracker_key, def_version, def_hash, occurred_at, local_day) VALUES ($1,'stool',1,'x',now(),current_date)`, [A]))).rejects.toThrow(/row-level security/);
  });
  it('the app role cannot read matviews directly, only the scoped views', async () => {
    const c = new pg.Client({ connectionString: APP_URL }); await c.connect();
    await expect(c.query('SELECT * FROM daily_exposure LIMIT 1')).rejects.toThrow(/permission denied/);
    await c.end();
  });
  it('the app role is neither superuser, owner nor BYPASSRLS', async () => {
    const c = new pg.Client({ connectionString: APP_URL }); await c.connect();
    const r = (await c.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0];
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    const owners = (await c.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tableowner = current_user`)).rows[0].n;
    expect(owners).toBe(0);
    await c.end();
  });
});

describe('encryption at rest (D28)', () => {
  it('meal text and notes are ciphertext in Postgres and plaintext through the service', async () => {
    const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect();
    const raw = (await c.query(`SELECT raw_text FROM meal_item WHERE user_id = $1 LIMIT 5`, [A])).rows;
    for (const r of raw) expect(Buffer.from(r.raw_text).toString('utf8')).not.toMatch(/[א-ת]{2}/);
    const desc = (await c.query(`SELECT value_text, value_enc FROM observation_value WHERE user_id = $1 AND field_key = 'description' LIMIT 1`, [A])).rows[0];
    expect(desc.value_text).toBeNull(); expect(desc.value_enc).toBeTruthy();
    const log = (await c.query(`SELECT payload::text AS p FROM change_log WHERE user_id = $1 LIMIT 20`, [A])).rows;
    for (const l of log) expect(l.p).not.toMatch(/[א-ת]{2}/);
    await c.end();
    const r = await withUser(deps.db, A, async (tx) => createObservation(tx, { deps, deviceId: 't' }, {
      client_id: 'enc-test-0001', tracker_key: 'note', occurred_at: new Date().toISOString(), time_source: 'now', source: 'manual',
      values: { text: 'went to my brother’s, ate too much at the barbecue' }, note: 'private' }));
    expect(r.observation.values.text).toContain('barbecue'); expect(r.observation.note).toBe('private');
  });
  it('ciphertext copied to another row does not decrypt (AAD bound to row id)', async () => {
    const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect();
    const rows = (await c.query(`SELECT id, raw_text FROM meal_item WHERE user_id = $1 LIMIT 2`, [A])).rows;
    expect(() => deps.keys.crypto.open('meal_item', 'raw_text', rows[1].id, rows[0].raw_text)).toThrow();
    await c.end();
  });
});

describe('fail-closed boot', () => {
  const base = { NODE_ENV: 'test', DATABASE_URL: APP_URL, DATABASE_OWNER_URL: OWNER_URL };
  it('missing KEK → kek_missing', async () => {
    await expect(boot({ ...base, FOODTRACK_KEK: '' }, { migrate: false })).rejects.toMatchObject({ reason: 'kek_missing' });
  });
  it('malformed KEK → kek_malformed', async () => {
    await expect(boot({ ...base, FOODTRACK_KEK: 'abc' }, { migrate: false })).rejects.toMatchObject({ reason: 'kek_malformed' });
  });
  it('wrong KEK → kek_mismatch, never plaintext fallback', async () => {
    const e = await boot({ ...base, FOODTRACK_KEK: Buffer.alloc(32, 7).toString('base64') }, { migrate: false }).catch((x) => x);
    expect(e).toBeInstanceOf(KeyError); expect(e.reason).toBe('kek_mismatch');
  });
  it('an invalid tracker definition fails startup with path and reason', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    cpSync(join(REPO_ROOT, 'config'), dir, { recursive: true });
    writeFileSync(join(dir, 'trackers', 'stool.json'), JSON.stringify({ key: 'stool', version: 1 }));
    await expect(boot({ ...base, FOODTRACK_KEK: TEST_KEK, CONFIG_DIR: dir }, { migrate: false })).rejects.toThrow(/stool\.json[\s\S]*category/);
  });
});

describe('write path rules (02 §7)', () => {
  it('local_day is server-computed with the 04:00 rollover', async () => {
    const at = new Date(); at.setUTCHours(22, 30, 0, 0); // 01:30 Israel next calendar day
    const r = await withUser(deps.db, A, (tx) => createObservation(tx, { deps, deviceId: 't' }, {
      client_id: 'day-test-0001', tracker_key: 'stool', occurred_at: new Date(at.getTime() - 86400_000).toISOString(), time_source: 'user_set', source: 'manual', values: { bristol: 4 } }));
    expect(r.observation.local_day).toBe(new Date(at.getTime() - 86400_000).toISOString().slice(0, 10));
  });
  it('replaying the same client_id is idempotent', async () => {
    const input = { client_id: 'idem-0000001', tracker_key: 'stool', occurred_at: new Date().toISOString(), time_source: 'now' as const, source: 'manual' as const, values: { bristol: 5 } };
    const a = await withUser(deps.db, A, (tx) => createObservation(tx, { deps, deviceId: 't' }, input));
    const b = await withUser(deps.db, A, (tx) => createObservation(tx, { deps, deviceId: 't' }, input));
    expect(b.created).toBe(false); expect(b.observation.id).toBe(a.observation.id);
  });
  it('rejects more than 24 h in the future', async () => {
    await expect(withUser(deps.db, A, (tx) => createObservation(tx, { deps, deviceId: 't' }, {
      client_id: 'future-00001', tracker_key: 'stool', occurred_at: new Date(Date.now() + 30 * 3600_000).toISOString(), time_source: 'now', source: 'manual', values: { bristol: 4 } }))).rejects.toThrow(/future/);
  });
  it('blood in stool raises a red flag, once', async () => {
    const mk = (cid: string) => withUser(deps.db, B, (tx) => createObservation(tx, { deps, deviceId: 't' }, {
      client_id: cid, tracker_key: 'stool', occurred_at: new Date().toISOString(), time_source: 'now', source: 'manual', values: { bristol: 5, blood: true } }));
    expect((await mk('blood-000001')).safety_flags.map((f) => f.rule_key)).toEqual(['red_flag_blood']);
    expect((await mk('blood-000002')).safety_flags).toEqual([]);
  });
  it('time_precision: slot_median → slot_estimate; late "now" → day_only; user_set → exact', async () => {
    const mk = (cid: string, ts: 'slot_median' | 'now' | 'user_set', ago: number) => withUser(deps.db, A, (tx) => createObservation(tx, { deps, deviceId: 't' }, {
      client_id: cid, tracker_key: 'stool', occurred_at: new Date(Date.now() - ago).toISOString(), time_source: ts, source: 'manual', values: { bristol: 4 } }));
    expect((await mk('tp-00000001', 'slot_median', 5 * 3600_000)).observation.time_precision).toBe('slot_estimate');
    expect((await mk('tp-00000002', 'now', 5 * 3600_000)).observation.time_precision).toBe('day_only');
    expect((await mk('tp-00000003', 'user_set', 5 * 3600_000)).observation.time_precision).toBe('exact');
  });
});

describe('the synthetic fixture carries the injected effect', () => {
  it('naive lagged risk difference for loose stool after dairy (6–24 h) is clearly positive', async () => {
    const foods = await loadFoodRefs(deps.db, A);
    const { observations } = generateFixture(foods, { days: 90, seed: 42 });
    const lactose = new Set((await withUser(deps.db, A, (tx) => tx.query<{ food_id: string }>(`SELECT food_id FROM my_food_tag_resolved WHERE tag = 'contains_lactose'`))).rows.map((r) => r.food_id));
    const dairyTimes = observations.filter((o) => o.tracker_key === 'meal' && o.meal_items?.some((i) => lactose.has(i.food_id!))).map((o) => Date.parse(o.occurred_at));
    let e = 0, eL = 0, u = 0, uL = 0;
    for (const s of observations.filter((o) => o.tracker_key === 'stool')) {
      const t = Date.parse(s.occurred_at);
      const lag = dairyTimes.some((m) => (t - m) / 3600_000 >= 6 && (t - m) / 3600_000 < 24);
      const loose = (s.values.bristol as number) >= 6;
      if (lag) { e++; if (loose) eL++; } else { u++; if (loose) uL++; }
    }
    const rd = eL / e - uL / u;
    expect(rd).toBeGreaterThan(0.2);
  });
});

describe('migrations', () => {
  it('roll back and re-apply cleanly', async () => {
    await deps.db.end();
    expect(await migrate(OWNER_URL, 'down', () => undefined)).toEqual(['0001_init']);
    expect(await migrate(OWNER_URL, 'up', () => undefined)).toEqual(['0001_init']);
    deps = await freshDeps();
  });
});
