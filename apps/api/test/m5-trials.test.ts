import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { uuidv7, addDays, FORBIDDEN_SYNC_KEYS } from '@foodtrack/shared';
import { REPO_ROOT } from '../src/config';
import '../src/workers/register';
import { generateFixture } from '../src/fixtures/synthetic';
import { insertFixture, loadFoodRefs } from '../src/fixtures/load';
import { APP_URL, OWNER_URL, createUser, freshDeps, testApp } from './helpers';
import { issueAccess } from '../src/services/auth';
import { withUser } from '../src/db/pool';

const PORT = 8766;
let py: ChildProcess; let deps: Awaited<ReturnType<typeof freshDeps>>; let app: FastifyInstance; let A = ''; let tA = '';
const H = () => ({ authorization: `Bearer ${tA}` });
const DAIRY = { kind: 'tag', ref: 'contains_lactose', label: { en: 'Dairy (lactose)', he: 'מוצרי חלב (לקטוז)' } };

async function tokenFor(uid: string) {
  const sid = await withUser(deps.db, uid, async (tx) => (await tx.query<{ id: string }>(`INSERT INTO auth_session (user_id, family_id, token_hash, expires_at) VALUES (app_current_user(), uuidv7(), gen_random_bytes(16), now() + interval '1 day') RETURNING id`)).rows[0]!.id);
  await withUser(deps.db, uid, (tx) => tx.query('UPDATE auth_session SET family_id = id WHERE id = $1', [sid]));
  return issueAccess(deps, uid, sid);
}
async function owner(sql: string, p: unknown[] = []) { const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect(); try { return await c.query(sql, p); } finally { await c.end(); } }

beforeAll(async () => {
  const python = process.env.PYTHON ?? (process.env.CI ? 'python' : '/home/user/.venv-ft/bin/python');
  py = spawn(python, ['-m', 'uvicorn', 'main:app', '--port', String(PORT), '--log-level', 'warning'], { cwd: join(REPO_ROOT, 'apps/analysis'), env: { ...process.env, DATABASE_URL: APP_URL.replace('postgres://', 'postgresql://') }, stdio: 'inherit' });
  deps = await freshDeps({ ANALYSIS_URL: `http://127.0.0.1:${PORT}` });
  app = await testApp(deps);
  A = await createUser(deps);
  await insertFixture(deps, A, generateFixture(await loadFoodRefs(deps.db, A), { days: 30, seed: 3 }).observations);
  tA = await tokenFor(A);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
}, 120_000);
afterAll(async () => { py?.kill(); await app?.close(); await deps?.db.end(); });

describe('trials (07 M5 done-when)', () => {
  let trialId = '';
  it('a proposal is pre-registered with a fixed minimum effect, a reintroduction, and an open-label design', async () => {
    const p = (await app.inject({ method: 'POST', url: '/api/v1/trials/propose', headers: H(), payload: { target: DAIRY } })).json();
    expect(p.hypothesis.minimum_interesting_effect).toBe(0.2);
    expect(p.phases.map((x: { phase: string }) => x.phase)).toContain('challenge');
    expect(p.nutrition_note.nutrients).toContain('calcium');
    expect(p.blinding.available).toBe(true);
  });
  it('a medication can never be a trial target', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/trials/propose', headers: H(), payload: { target: { kind: 'medication', ref: 'nsaid', label: { en: 'x', he: 'x' } } } });
    expect(r.statusCode).toBe(422); expect(r.json().reason).toBe('medication_never');
    expect(r.json().detail).toMatch(/don’t change it on your own/);
  });
  it('the locked fields cannot be edited and too-short eliminations are refused', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/trials', headers: H(), payload: { target: DAIRY, minimum_interesting_effect: 0.05 } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/v1/trials', headers: H(), payload: { target: DAIRY, elimination_days: 10 } })).json().type).toMatch(/too_short/);
  });
  it('starts, and a second active trial is refused with a machine-readable reason', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/trials', headers: H(), payload: { target: DAIRY, start_date: addDays(new Date().toISOString().slice(0, 10), -1) } });
    expect(r.statusCode, r.body).toBe(201); trialId = r.json().id;
    expect(r.json().status).toBe('active'); expect(r.json().open_label).toBe(true);
    const r2 = await app.inject({ method: 'POST', url: '/api/v1/trials/propose', headers: H(), payload: { target: { kind: 'tag', ref: 'contains_gluten', label: { en: 'g', he: 'g' } } } });
    expect(r2.statusCode).toBe(409); expect(r2.json().reason).toBe('active_trial_exists');
  });
  it('the pre-registration is immutable at the database level', async () => {
    await expect(withUser(deps.db, A, (tx) => tx.query(`UPDATE trial SET hypothesis = hypothesis || '{"minimum_interesting_effect": 0.01}' WHERE id = $1`, [trialId]))).rejects.toThrow(/locked/);
  });
  it('logging a meal with the target during elimination raises the exposure prompt in the same request', async () => {
    const { rows } = await owner(`SELECT local_day::text FROM trial_day WHERE trial_id = $1 AND phase = 'elimination' ORDER BY local_day LIMIT 1`, [trialId]);
    const day = rows[0].local_day as string;
    const milk = (await withUser(deps.db, A, (tx) => tx.query<{ id: string }>(`SELECT id FROM food WHERE canonical_name = 'Milk'`))).rows[0]!.id;
    const r = await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: {
      client_id: `c-${uuidv7()}`, tracker_key: 'meal', occurred_at: new Date(`${day}T09:00:00+03:00`).toISOString(), time_source: 'user_set',
      values: { description: 'קפה עם חלב' }, meal_items: [{ raw_text: 'חלב', food_id: milk, quantity: 1, unit: 'cup', grams_est: 240, confidence: 0.9 }] } });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().trial_exposure).toMatchObject({ trial_id: trialId, local_day: day, items: ['חלב'] });
    const t = (await app.inject({ url: `/api/v1/trials/${trialId}`, headers: H() })).json();
    expect(t.days.find((d: { local_day: string }) => d.local_day === day)).toMatchObject({ exposure_detected: true, adherent: false });
  });
  it('no verdict and no live estimate while running (D21)', async () => {
    expect((await app.inject({ url: `/api/v1/trials/${trialId}/verdict`, headers: H() })).statusCode).toBe(409);
  });
  it('US-06 AC5: a trial stopped with poor adherence is inconclusive, never negative', async () => {
    await owner(`UPDATE trial_day SET adherent = false, logged = true WHERE trial_id = $1 AND phase = 'elimination'`, [trialId]);
    const r = await app.inject({ method: 'POST', url: `/api/v1/trials/${trialId}/stop-early`, headers: H() });
    expect(r.statusCode, r.body).toBe(200);
    const v = (await app.inject({ url: `/api/v1/trials/${trialId}/verdict`, headers: H() })).json();
    expect(v.verdict).toBe('inconclusive'); expect(v.partial).toBe(true); expect(v.open_label).toBe(true);
    expect(v.limitations).toContain('open_label');
  });
  it('the elimination-load cap refuses a fourth', async () => {
    for (const ref of ['wheat', 'legume', 'spicy']) await app.inject({ method: 'POST', url: '/api/v1/avoid', headers: H(), payload: { kind: 'tag', ref, label: { en: ref, he: ref } } });
    const r = await app.inject({ method: 'POST', url: '/api/v1/trials/propose', headers: H(), payload: { target: { kind: 'tag', ref: 'caffeine', label: { en: 'c', he: 'c' } } } });
    expect(r.json().reason).toBe('elimination_cap');
    for (const e of (await app.inject({ url: '/api/v1/avoid', headers: H() })).json().data) await app.inject({ method: 'DELETE', url: `/api/v1/avoid/${e.id}`, headers: H() });
  });
});

describe('Design D: the allocation never leaks (the blinding gate)', () => {
  let id = '';
  it('a blinded trial seals its allocation, and no response or sync payload carries it before reveal', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/trials', headers: H(), payload: { target: DAIRY, preferred_design: 'D' } });
    expect(r.statusCode, r.body).toBe(201); id = r.json().id;
    expect(r.json().design).toBe('D'); expect(r.json().status).toBe('proposed');
    await app.inject({ method: 'POST', url: `/api/v1/trials/${id}/start`, headers: H() });
    const bodies = [
      (await app.inject({ url: `/api/v1/trials/${id}`, headers: H() })).body,
      (await app.inject({ url: '/api/v1/trials', headers: H() })).body,
      (await app.inject({ url: `/api/v1/trials/${id}/schedule`, headers: H() })).body,
      (await app.inject({ method: 'POST', url: `/api/v1/trials/${id}/allocation`, headers: H() })).body,
      (await app.inject({ url: '/api/v1/sync/pull?since=0&limit=1000', headers: H() })).body,
    ];
    for (const b of bodies) {
      for (const k of FORBIDDEN_SYNC_KEYS) expect(b).not.toContain(`"${k}"`);
      expect(b).not.toMatch(/\["(active|control)"|"phase":"(active|control)"|"arm"/);
    }
    expect((await app.inject({ method: 'POST', url: `/api/v1/trials/${id}/reveal`, headers: H() })).statusCode).toBe(409);
  });
  it('reveal is allowed only after the trial ends, is idempotent, and audit-logged', async () => {
    await app.inject({ method: 'POST', url: `/api/v1/trials/${id}/abandon`, headers: H(), payload: { reason: 'other' } });
    const r1 = (await app.inject({ method: 'POST', url: `/api/v1/trials/${id}/reveal`, headers: H() })).json();
    expect(r1.allocation).toHaveLength(6);
    const r2 = (await app.inject({ method: 'POST', url: `/api/v1/trials/${id}/reveal`, headers: H() })).json();
    expect(r2.already).toBe(true); expect(r2.allocation).toEqual(r1.allocation);
    const { rows } = await owner(`SELECT count(*)::int AS n FROM security_audit WHERE action = 'trial_revealed'`);
    expect(rows[0].n).toBe(1);
  });
});
