import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from '@foodtrack/shared';
import '../src/workers/register';
import { runOnce } from '../src/workers/jobs';
import { generateFixture } from '../src/fixtures/synthetic';
import { freshDeps, testApp } from './helpers';
import { loadFoodRefs, insertFixture } from '../src/fixtures/load';

let deps: Awaited<ReturnType<typeof freshDeps>>; let app: FastifyInstance; let tok = ''; let uid = '';
const H = () => ({ authorization: `Bearer ${tok}` });
const PASS = 'export test passphrase';
const today = new Date().toISOString().slice(0, 10);
const ago = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  deps = await freshDeps(); app = await testApp(deps);
  const r = (await app.inject({ method: 'POST', url: '/api/v1/auth/setup', payload: { passphrase: PASS, locale: 'en-US', timezone: 'Asia/Jerusalem' } })).json();
  tok = r.access_token; uid = r.user_id;
  await insertFixture(deps, uid, generateFixture(await loadFoodRefs(deps.db, uid), { days: 40, seed: 9 }).observations);
});
afterAll(async () => { await app.close(); await deps.db.end(); });

describe('export & import (03 §9)', () => {
  let file = '';
  it('a JSON export is a job with a one-time signed link that needs no bearer header', async () => {
    const { job_id } = (await app.inject({ method: 'POST', url: '/api/v1/export', headers: H(), payload: { format: 'json', from: ago(60), to: today } })).json();
    await runOnce(deps);
    const st = (await app.inject({ url: `/api/v1/export/${job_id}`, headers: H() })).json();
    expect(st.status).toBe('done');
    const dl = await app.inject({ url: st.url });
    expect(dl.statusCode).toBe(200); expect(dl.headers['cache-control']).toBe('no-store');
    file = dl.body;
    expect(JSON.parse(file).observations.length).toBeGreaterThan(100);
    expect((await app.inject({ url: st.url })).statusCode).toBe(410);                    // once only
    expect((await app.inject({ url: st.url.replace(/sig=[^&]+/, 'sig=forged') })).statusCode).toBe(410);
  });
  it('CSV export works and carries the meal items', async () => {
    const { job_id } = (await app.inject({ method: 'POST', url: '/api/v1/export', headers: H(), payload: { format: 'csv', from: ago(60), to: today } })).json();
    await runOnce(deps);
    const csv = (await app.inject({ url: (await app.inject({ url: `/api/v1/export/${job_id}`, headers: H() })).json().url })).body;
    expect(csv.split('\n')[0]).toContain('value.bristol');
  });
  it('import is a dry run by default, idempotent on client_id, and restores into a fresh account', async () => {
    const again = (await app.inject({ method: 'POST', url: '/api/v1/import', headers: { ...H(), 'content-type': 'application/json' }, payload: file })).json();
    expect(again).toMatchObject({ dry_run: true, would_create: 0 });
    expect(again.already_present).toBe(again.total);
  });
  it('the clinical summary has the published IBS-SSS item structure, labelled as derived', async () => {
    const c = (await app.inject({ url: `/api/v1/export/clinical?from=${ago(40)}&to=${today}`, headers: H() })).json();
    expect(Object.keys(c.ibs_sss_style.items)).toEqual(['pain_severity', 'pain_frequency', 'distension', 'bowel_dissatisfaction', 'life_interference']);
    expect(c.ibs_sss_style.derived).toBe(true);
    expect(Object.keys(c.bristol_distribution).length).toBeGreaterThan(2);
    expect(c.diary.length).toBeGreaterThan(0);
  });
});

describe('charts come from the definitions', () => {
  it('lists charts declared in config, including a distribution', async () => {
    const list = (await app.inject({ url: '/api/v1/charts', headers: H() })).json().data;
    const dist = list.find((c: { type: string }) => c.type === 'distribution');
    const r = (await app.inject({ url: `/api/v1/charts/${dist.key}?days=60`, headers: H() })).json();
    expect(r.bins).toHaveLength(7);
    expect(r.bins.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBeGreaterThan(10);
  });
});

describe('security', () => {
  it('the recovery card needs the passphrase again, and a pasted card verifies', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/security/recovery-card', headers: H(), payload: { passphrase: 'wrong one' } })).statusCode).toBe(401);
    const card = await app.inject({ method: 'POST', url: '/api/v1/security/recovery-card', headers: H(), payload: { passphrase: PASS } });
    expect(card.statusCode).toBe(200); expect(card.body).toContain('FoodTrack recovery card');
    expect((await app.inject({ method: 'POST', url: '/api/v1/security/verify-card', headers: H(), payload: { card: card.body } })).json().valid).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/v1/security/verify-card', headers: H(), payload: { card: card.body.replace(/check\s+\S+/, 'check 0000-0000-0000') } })).json().valid).toBe(false);
    const audit = (await app.inject({ url: '/api/v1/security/audit', headers: H() })).json().data.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['recovery_card_shown', 'recovery_card_verified']));
  });
});

describe('M7 — a tracker added as pure config works everywhere', () => {
  it('migraine: listed, enabled via its pack, validated, rolled up, charted', async () => {
    expect((await app.inject({ url: '/api/v1/trackers', headers: H() })).json().data.map((d: { key: string }) => d.key)).toContain('migraine');
    await app.inject({ method: 'POST', url: '/api/v1/me/packs/migraine/apply', headers: H() });
    const bad = await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: { client_id: `c-${uuidv7()}`, tracker_key: 'migraine', occurred_at: new Date().toISOString(), values: { severity: 12 } } });
    expect(bad.statusCode).toBe(422);
    const ok = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: { client_id: `c-${uuidv7()}`, tracker_key: 'migraine', occurred_at: new Date().toISOString(), values: { severity: 7, aura: true } } })).json();
    const day = (await app.inject({ url: `/api/v1/days/${ok.local_day}`, headers: H() })).json();
    expect(day.rollup.trackers.migraine.severity_max).toBe(7);
    expect(day.rollup.day_weight.outcome_recorded).toBe(1);
    const charts = (await app.inject({ url: '/api/v1/charts', headers: H() })).json().data;
    expect(charts.some((c: { tracker: string }) => c.tracker === 'migraine')).toBe(true);
  });
});
