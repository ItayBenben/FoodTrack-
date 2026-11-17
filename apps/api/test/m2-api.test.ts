import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Deps } from '../src/app';
import { FORBIDDEN_SYNC_KEYS, uuidv7 } from '@foodtrack/shared';
import { freshDeps, testApp } from './helpers';

let deps: Deps; let app: FastifyInstance;
const PASS = 'a long enough passphrase';

async function setup(): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/v1/auth/setup', payload: { passphrase: PASS, locale: 'en-US', timezone: 'Asia/Jerusalem', disclaimer_accepted: true } });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().access_token;
}
const auth = (t: string) => ({ authorization: `Bearer ${t}`, 'x-device-id': 'dev-test-1' });
const stool = (bristol: number, cid = `c-${uuidv7()}`) => ({ client_id: cid, tracker_key: 'stool', occurred_at: new Date().toISOString(), time_source: 'now', values: { bristol } });

beforeAll(async () => { deps = await freshDeps(); app = await testApp(deps); });
afterAll(async () => { await app.close(); await deps.db.end(); });

describe('auth (03 §2)', () => {
  let token: string; let refreshCookie: string;
  it('status reports not set up, then setup creates the account with the default packs', async () => {
    expect((await app.inject({ url: '/api/v1/auth/status' })).json()).toMatchObject({ mode: 'single', set_up: false });
    token = await setup();
    const me = (await app.inject({ url: '/api/v1/auth/me', headers: auth(token) })).json();
    expect(me.trackers.filter((t: { enabled: boolean }) => t.enabled).map((t: { tracker_key: string }) => t.tracker_key)).toEqual(expect.arrayContaining(['meal', 'stool', 'symptom', 'checkin', 'weight']));
  });
  it('a second setup is refused in single-user mode', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/setup', payload: { passphrase: 'another passphrase 123' } });
    expect(r.statusCode).toBe(409);
  });
  it('unauthenticated requests get problem+json 401 with a reassuring detail', async () => {
    const r = await app.inject({ url: '/api/v1/observations' });
    expect(r.statusCode).toBe(401); expect(r.headers['content-type']).toContain('problem+json');
    expect(r.json().detail).toMatch(/still saved on this device/);
  });
  it('unlock issues tokens; wrong passphrase counts down then locks out', async () => {
    const ok = await app.inject({ method: 'POST', url: '/api/v1/auth/unlock', payload: { passphrase: PASS } });
    expect(ok.statusCode).toBe(200);
    refreshCookie = String(ok.headers['set-cookie']).split(';')[0]!;
    for (let i = 1; i <= 5; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/auth/unlock', payload: { passphrase: 'wrong wrong wrong' }, remoteAddress: `10.0.0.${i}` });
      if (i < 3) expect(r.json().attempts_remaining).toBeUndefined();
      if (i === 3) expect(r.json().attempts_remaining).toBe(2);
    }
    const locked = await app.inject({ method: 'POST', url: '/api/v1/auth/unlock', payload: { passphrase: PASS }, remoteAddress: '10.0.1.1' });
    expect(locked.statusCode).toBe(429); expect(locked.json().retry_after_s).toBeGreaterThan(0);
    await deps.db.query('SELECT 1'); // clear lockout for the rest of the suite
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: (await import('./helpers')).OWNER_URL }); await c.connect(); await c.query('UPDATE app_user SET failed_attempts = 0, locked_until = NULL'); await c.end();
  });
  it('refresh rotates; replaying an old refresh token revokes the family', async () => {
    const r1 = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie: refreshCookie } });
    expect(r1.statusCode).toBe(200);
    const newer = String(r1.headers['set-cookie']).split(';')[0]!;
    const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie: refreshCookie } });
    expect(replay.statusCode).toBe(401);
    const afterReuse = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie: newer } });
    expect(afterReuse.statusCode).toBe(401);
    // and the access token for that family stops working too
    expect((await app.inject({ url: '/api/v1/observations', headers: auth(r1.json().access_token) })).statusCode).toBe(401);
  });
  it('the reset endpoint refuses anything that came through a proxy', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/reset-passphrase', headers: { 'x-forwarded-for': '1.2.3.4' } });
    expect(r.statusCode).toBe(404);
    const local = await app.inject({ method: 'POST', url: '/api/v1/auth/reset-passphrase', remoteAddress: '127.0.0.1' });
    expect(local.statusCode).toBe(200);
    const use = await app.inject({ method: 'POST', url: `/api/v1/auth/reset-passphrase/${local.json().token}`, payload: { passphrase: PASS } });
    expect(use.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/v1/auth/reset-passphrase/${local.json().token}`, payload: { passphrase: PASS } })).statusCode).toBe(410);
  });
});

describe('observations (03 §4)', () => {
  let t: string;
  beforeAll(async () => { t = (await app.inject({ method: 'POST', url: '/api/v1/auth/unlock', payload: { passphrase: PASS } })).json().access_token; });
  it('validates against the definition and reports the field path', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/observations', headers: auth(t), payload: { ...stool(4), values: {} } });
    expect(r.statusCode).toBe(422);
    expect(r.json().errors[0]).toMatchObject({ path: 'values.bristol', code: 'required' });
    expect(r.json().detail).toBe("field 'bristol' is required for tracker 'stool'");
  });
  it('creates, reads, patches with a revision, deletes and restores', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/v1/observations', headers: auth(t), payload: stool(6) });
    expect(c.statusCode).toBe(201);
    const o = c.json();
    expect(o.local_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const p = await app.inject({ method: 'PATCH', url: `/api/v1/observations/${o.id}`, headers: auth(t), payload: { values: { bristol: 5 }, note: 'edited' } });
    expect(p.json()).toMatchObject({ revision: 2, note: 'edited', values: { bristol: 5 } });
    const revs = (await app.inject({ url: `/api/v1/observations/${o.id}/revisions`, headers: auth(t) })).json();
    expect(revs.data[0].snapshot.values.bristol).toBe(6);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/observations/${o.id}`, headers: auth(t) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/observations/deleted', headers: auth(t) })).json().data.map((x: { id: string }) => x.id)).toContain(o.id);
    expect((await app.inject({ method: 'POST', url: `/api/v1/observations/${o.id}/restore`, headers: auth(t) })).json().deleted_at).toBeNull();
  });
  it('days and score: a loose stool and bloating lower the gut-day score, with components', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/observations', headers: auth(t), payload: { client_id: `c-${uuidv7()}`, tracker_key: 'symptom', occurred_at: new Date().toISOString(), values: { kind: 'bloating', severity: 6 } } });
    const day = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: auth(t), payload: stool(7) })).json().local_day;
    const d = (await app.inject({ url: `/api/v1/days/${day}`, headers: auth(t) })).json();
    expect(d.rollup.score.value).toBeLessThan(100);
    expect(d.rollup.score.components.map((c: { key: string }) => c.key)).toEqual(['stool_deviation', 'symptom_load', 'urgency', 'incompleteness']);
    expect(d.rollup.trackers.stool.loose).toBe(true);
  });
});

describe('sync (03 §8)', () => {
  let t: string;
  beforeAll(async () => { t = (await app.inject({ method: 'POST', url: '/api/v1/auth/unlock', payload: { passphrase: PASS } })).json().access_token; });
  it('push is idempotent and per-mutation; a bad row does not block the rest', async () => {
    const a = stool(4, 'push-a-000001'); const bad = { ...stool(4, 'push-b-000001'), values: { bristol: 99 } }; const c = stool(3, 'push-c-000001');
    const body = { device_id: 'dev-A', mutations: [a, bad, c].map((p) => ({ client_id: p.client_id, entity: 'observation', op: 'upsert', payload: p })) };
    const r1 = (await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: auth(t), payload: body })).json();
    expect(r1.applied).toHaveLength(2); expect(r1.rejected).toHaveLength(1); expect(r1.rejected[0].client_id).toBe('push-b-000001');
    const r2 = (await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: auth(t), payload: body })).json();
    expect(r2.applied.map((x: { entity_id: string }) => x.entity_id)).toEqual(r1.applied.map((x: { entity_id: string }) => x.entity_id));
    const n = (await app.inject({ url: '/api/v1/observations?tracker_key=stool&limit=500', headers: auth(t) })).json().data.filter((o: { client_id: string }) => o.client_id.startsWith('push-')).length;
    expect(n).toBe(2);
  });
  it('a mutation that fails validation is rejected alone, with a reason — it never blocks the batch', async () => {
    const good = stool(4, 'push-v-000001');
    const badTime = { ...stool(4, 'push-v-000002'), occurred_at: '2026-11-16T12:00:00' }; // no offset
    const body = { device_id: 'dev-A', mutations: [
      { client_id: good.client_id, entity: 'observation', op: 'upsert', payload: good },
      { client_id: badTime.client_id, entity: 'observation', op: 'upsert', payload: badTime },
      { entity: 'observation', op: 'upsert', payload: {} }] };
    const res = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: auth(t), payload: body });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.applied.map((x: { client_id: string }) => x.client_id)).toEqual(['push-v-000001']);
    expect(r.rejected).toHaveLength(2);
    expect(r.rejected[0]).toMatchObject({ client_id: 'push-v-000002', reason: 'validation' });
    expect(r.rejected[0].detail).toContain('payload.occurred_at');
  });
  it('per-field conflict: the later edit wins, the loser is kept in revisions', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: auth(t), payload: { ...stool(4, 'conf-000001'), note: 'orig' } })).json();
    // device B edits the note now (server-side, revision 2)
    await app.inject({ method: 'PATCH', url: `/api/v1/observations/${created.id}`, headers: auth(t), payload: { note: 'from B' } });
    // device A edited from revision 1, earlier in time (offline), then pushes
    const earlier = new Date(Date.now() - 60_000).toISOString();
    const r = (await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: auth(t), payload: { device_id: 'dev-A', mutations: [
      { client_id: 'conf-edit-1', entity: 'observation', op: 'upsert', base_revision: 1, recorded_at: earlier, payload: { ...stool(4, 'conf-000001'), note: 'from A' } }] } })).json();
    expect(r.conflicts[0]).toMatchObject({ resolution: 'server_wins_field', fields: ['note'] });
    const now = (await app.inject({ url: `/api/v1/observations/${created.id}`, headers: auth(t) })).json();
    expect(now.note).toBe('from B');
    const revs = (await app.inject({ url: `/api/v1/observations/${created.id}/revisions`, headers: auth(t) })).json().data;
    expect(revs.some((x: { reason: string; snapshot: { note: string } }) => x.reason === 'conflict_loser' && x.snapshot.note === 'from A')).toBe(true);
  });
  it('a conflict on a deleted record resolves to deleted', async () => {
    const o = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: auth(t), payload: stool(4, 'del-conf-0001') })).json();
    await app.inject({ method: 'DELETE', url: `/api/v1/observations/${o.id}`, headers: auth(t) });
    const r = (await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: auth(t), payload: { device_id: 'dev-A', mutations: [
      { client_id: 'del-edit-01', entity: 'observation', op: 'upsert', base_revision: 1, payload: { ...stool(5, 'del-conf-0001') } }] } })).json();
    expect(r.conflicts[0].resolution).toBe('deleted_wins');
  });
  it('pull returns decrypted, allowlisted payloads with no forbidden key anywhere', async () => {
    const r = (await app.inject({ url: '/api/v1/sync/pull?since=0&limit=1000&device_id=dev-Z', headers: auth(t) })).json();
    expect(r.changes.length).toBeGreaterThan(5);
    const text = JSON.stringify(r);
    for (const k of FORBIDDEN_SYNC_KEYS) expect(text).not.toContain(`"${k}"`);
    expect(text).not.toContain('_sealed');
    expect(r.changes.find((c: { payload: { note: string } }) => c.payload.note === 'from B')).toBeTruthy();
    const after = (await app.inject({ url: `/api/v1/sync/pull?since=${r.next_seq}&device_id=dev-Z`, headers: auth(t) })).json();
    expect(after.changes).toEqual([]);
  });
});

describe('cross-user isolation per endpoint', () => {
  it('user B gets 404 or empty for everything of user A', async () => {
    const tA = (await app.inject({ method: 'POST', url: '/api/v1/auth/unlock', payload: { passphrase: PASS } })).json().access_token;
    const o = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: auth(tA), payload: stool(4) })).json();
    const { createUser } = await import('./helpers');
    const B = await createUser(deps, 'user b passphrase long');
    const { issueAccess } = await import('../src/services/auth');
    const { withUser } = await import('../src/db/pool');
    const sid = await withUser(deps.db, B, async (tx) => (await tx.query<{ id: string }>(`INSERT INTO auth_session (user_id, family_id, token_hash, expires_at) VALUES (app_current_user(), uuidv7(), 'x', now() + interval '1 day') RETURNING id`)).rows[0]!.id);
    await withUser(deps.db, B, (tx) => tx.query('UPDATE auth_session SET family_id = id WHERE id = $1', [sid]));
    const tB = await issueAccess(deps, B, sid);
    expect((await app.inject({ url: `/api/v1/observations/${o.id}`, headers: auth(tB) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/observations/${o.id}`, headers: auth(tB), payload: { note: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/observations/${o.id}`, headers: auth(tB) })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/observations', headers: auth(tB) })).json().total).toBe(0);
    expect((await app.inject({ url: '/api/v1/sync/pull?since=0', headers: auth(tB) })).json().changes).toEqual([]);
    expect((await app.inject({ url: `/api/v1/days/${o.local_day}`, headers: auth(tB) })).json().observations).toEqual([]);
    expect((await app.inject({ url: '/api/v1/safety-flags', headers: auth(tB) })).json().total).toBe(0);
  });
});
