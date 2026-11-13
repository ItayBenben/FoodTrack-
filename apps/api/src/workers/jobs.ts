/**
 * Durable jobs (I-11): the `job` table, claimed with FOR UPDATE SKIP LOCKED. Retries with
 * exponential backoff; a restart never loses a queued job. Handlers run as the job's user, under RLS.
 */
import pg from 'pg';
import type { Deps } from '../app.js';
import { anonymous, withUser, type Tx } from '../db/pool.js';

export type Handler = (tx: Tx, deps: Deps, payload: Record<string, unknown>, userId: string | null) => Promise<unknown>;
export const handlers = new Map<string, Handler>();
export const systemHandlers = new Map<string, (deps: Deps, payload: Record<string, unknown>) => Promise<unknown>>();

interface JobRow { id: string; kind: string; user_id: string | null; payload: Record<string, unknown>; attempts: number; max_attempts: number }

export async function runOnce(deps: Deps, kinds: string[] | null = null, limit = 5): Promise<number> {
  const jobs = await anonymous(deps.db, async (tx) => (await tx.query<JobRow>('SELECT * FROM job_claim($1, $2)', [kinds, limit])).rows);
  for (const j of jobs) {
    try {
      let result: unknown;
      if (j.user_id) {
        const h = handlers.get(j.kind); if (!h) throw new Error(`no handler for ${j.kind}`);
        result = await withUser(deps.db, j.user_id, (tx) => h(tx, deps, j.payload, j.user_id));
      } else {
        const h = systemHandlers.get(j.kind); if (!h) throw new Error(`no system handler for ${j.kind}`);
        result = await h(deps, j.payload);
      }
      await anonymous(deps.db, (tx) => tx.query('SELECT job_finish($1, $2, $3, NULL, NULL)', [j.id, 'done', JSON.stringify(result ?? null)]));
    } catch (e) {
      const retry = (e as { retry?: boolean }).retry !== false && j.attempts < j.max_attempts;
      const at = new Date(Date.now() + Math.min(3600_000, 2000 * 2 ** j.attempts));
      await anonymous(deps.db, (tx) => tx.query('SELECT job_finish($1, $2, NULL, $3, $4)', [j.id, retry ? 'queued' : 'failed', String((e as Error).message).slice(0, 500), at]));
    }
  }
  return jobs.length;
}

export function startWorker(deps: Deps, opts: { intervalMs?: number } = {}) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    try { while (!stopped && (await runOnce(deps)) > 0) { /* drain */ } } catch { /* db hiccup: next tick */ }
    if (!stopped) timer = setTimeout(tick, opts.intervalMs ?? 2000);
  };
  void tick();
  // schedule analysis runs every 6 hours (one queued system job at a time, deduped)
  const sched = setInterval(() => void anonymous(deps.db, (tx) => tx.query(`SELECT job_enqueue_system('schedule_analysis', '{}', 'schedule_analysis', now())`)).catch(() => undefined), 6 * 3600_000);
  void anonymous(deps.db, (tx) => tx.query(`SELECT job_enqueue_system('schedule_analysis', '{}', 'schedule_analysis', now() + interval '5 minutes')`)).catch(() => undefined);
  return { stop: () => { stopped = true; clearInterval(sched); if (timer) clearTimeout(timer); }, kick: () => { if (timer) { clearTimeout(timer); timer = null; } void tick(); } };
}

/** Cross-process events: workers NOTIFY, the API LISTENs and republishes onto SSE. */
const PID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
export async function publish(deps: Deps, tx: Tx | null, userId: string, type: string, data: unknown) {
  deps.events.publish({ user_id: userId, type, data });
  const payload = JSON.stringify({ o: PID, u: userId, t: type, d: data });
  if (payload.length < 7900) await (tx ?? deps.db).query('SELECT pg_notify($1, $2)', ['ft_events', payload]).catch(() => undefined);
}
export async function listenEvents(deps: Deps) {
  const c = new pg.Client({ connectionString: deps.env.DATABASE_URL });
  await c.connect();
  await c.query('LISTEN ft_events');
  c.on('notification', (n) => { try { const m = JSON.parse(n.payload ?? '{}'); if (m.o !== PID) deps.events.publish({ user_id: m.u, type: m.t, data: m.d }); } catch { /* ignore */ } });
  c.on('error', () => undefined);
  return c;
}
