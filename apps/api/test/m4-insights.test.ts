import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { lintCopy } from '@foodtrack/shared';
import { REPO_ROOT } from '../src/config';
import { runOnce } from '../src/workers/jobs';
import '../src/workers/register';
import { generateFixture } from '../src/fixtures/synthetic';
import { insertFixture, loadFoodRefs } from '../src/fixtures/load';
import { APP_URL, createUser, freshDeps, testApp } from './helpers';
import { issueAccess } from '../src/services/auth';
import { withUser } from '../src/db/pool';

const PORT = 8765;
let py: ChildProcess; let deps: Awaited<ReturnType<typeof freshDeps>>; let app: FastifyInstance; let A: string; let tA = ''; let tB = '';

async function tokenFor(uid: string) {
  const sid = await withUser(deps.db, uid, async (tx) => (await tx.query<{ id: string }>(`INSERT INTO auth_session (user_id, family_id, token_hash, expires_at) VALUES (app_current_user(), uuidv7(), gen_random_bytes(16), now() + interval '1 day') RETURNING id`)).rows[0]!.id);
  await withUser(deps.db, uid, (tx) => tx.query('UPDATE auth_session SET family_id = id WHERE id = $1', [sid]));
  return issueAccess(deps, uid, sid);
}
const H = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  const python = process.env.PYTHON ?? (process.env.CI ? 'python' : '/home/user/.venv-ft/bin/python');
  py = spawn(python, ['-m', 'uvicorn', 'main:app', '--port', String(PORT), '--log-level', 'warning'], { cwd: join(REPO_ROOT, 'apps/analysis'), env: { ...process.env, DATABASE_URL: APP_URL.replace('postgres://', 'postgresql://') }, stdio: 'inherit' });
  deps = await freshDeps({ ANALYSIS_URL: `http://127.0.0.1:${PORT}` });
  app = await testApp(deps);
  A = await createUser(deps); const B = await createUser(deps, 'second user passphrase');
  const foods = await loadFoodRefs(deps.db, A);
  await insertFixture(deps, A, generateFixture(foods, { days: 90, seed: 42 }).observations);
  tA = await tokenFor(A); tB = await tokenFor(B);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
}, 120_000);
afterAll(async () => { py?.kill(); await app?.close(); await deps?.db.end(); });

describe('analysis → insights (07 M4 done-when)', () => {
  let insightId = '';
  it('a run is queued, idempotent while in flight, and completes through the worker', async () => {
    const r1 = await app.inject({ method: 'POST', url: '/api/v1/analysis/run', headers: H(tA) });
    expect(r1.statusCode).toBe(202);
    const r2 = await app.inject({ method: 'POST', url: '/api/v1/analysis/run', headers: H(tA) });
    expect(r2.statusCode).toBe(200); expect(r2.json().run_id).toBe(r1.json().run_id);
    await runOnce(deps);
    const run = (await app.inject({ url: `/api/v1/analysis/runs/${r1.json().run_id}`, headers: H(tA) })).json();
    expect(run.status, run.error).toBe('done');
  }, 120_000);
  it('the injected dairy → loose-stool effect is a finding worth testing, with the truth inside its interval', async () => {
    const ins = (await app.inject({ url: '/api/v1/insights', headers: H(tA) })).json();
    expect(ins.state).toBe('ready');
    const dairy = ins.sections.worth_testing.find((c: { exposure: { ref: string }; outcome: { ref: string } }) => /lactose|tag:dairy/.test(c.exposure.ref) && /any_abnormal|loose/.test(c.outcome.ref));
    expect(dairy, JSON.stringify(ins.sections.worth_testing.map((c: { exposure: { ref: string } }) => c.exposure.ref))).toBeTruthy();
    expect(dairy.lag_window_hours).toEqual([6, 24]);
    expect(dairy.evidence.ci[0]).toBeLessThan(0.38); expect(dairy.evidence.ci[1]).toBeGreaterThan(0.38);
    insightId = dairy.id;
  });
  it('every narrative and label is free of causal or diagnostic language', async () => {
    const ins = (await app.inject({ url: '/api/v1/insights', headers: H(tA) })).json();
    for (const c of [...ins.sections.worth_testing, ...ins.sections.early_signals]) {
      for (const t of [c.narrative?.en, c.narrative?.he].filter(Boolean)) expect(lintCopy(t), t).toEqual([]);
    }
  });
  it('US-05 AC4: drilling from an insight reaches the exact days behind it', async () => {
    const full = (await app.inject({ url: `/api/v1/insights/${insightId}`, headers: H(tA) })).json();
    const days = (await app.inject({ url: `/api/v1/insights/${insightId}/days`, headers: H(tA) })).json();
    expect(days.exposed.length).toBe(full.evidence.n_exposed_days);
    expect(days.unexposed.length).toBe(full.evidence.n_unexposed_days);
    const d = days.exposed[0].day;
    const dayView = (await app.inject({ url: `/api/v1/days/${d}`, headers: H(tA) })).json();
    expect(dayView.observations.some((o: { tracker_key: string }) => o.tracker_key === 'meal')).toBe(true);
  });
  it('dismissing hides the pair until its effect moves by more than 10 pp', async () => {
    await app.inject({ method: 'POST', url: `/api/v1/insights/${insightId}/dismiss`, headers: H(tA) });
    const ins = (await app.inject({ url: '/api/v1/insights', headers: H(tA) })).json();
    expect(ins.sections.worth_testing.find((c: { id: string }) => c.id === insightId)).toBeFalsy();
    await app.inject({ method: 'POST', url: `/api/v1/insights/${insightId}/undismiss`, headers: H(tA) });
  });
  it('another user sees none of it', async () => {
    expect((await app.inject({ url: `/api/v1/insights/${insightId}`, headers: H(tB) })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/insights', headers: H(tB) })).json().state).toBe('not_enough_days');
  });
});
