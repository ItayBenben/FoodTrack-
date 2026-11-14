import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addDays, localDay, ObservationInputSchema, ObservationPatchSchema } from '@foodtrack/shared';
import { withUser } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { createObservation, deleteObservation, loadObservation, loadObservations, restoreObservation, revisions, updateObservation } from '../services/observations.js';
import { rollupRange } from '../services/days.js';
import { getUser } from '../services/users.js';
import { deviceId } from './guard.js';

const DateS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function observationRoutes(app: FastifyInstance) {
  const { deps } = app;
  const ctx = (req: { headers: Record<string, unknown> }) => ({ deps, deviceId: deviceId(req as never) });

  app.post('/observations', async (req, reply) => {
    const input = ObservationInputSchema.parse(req.body);
    const c = ctx(req) as ReturnType<typeof ctx> & { notes?: { trial_exposure?: unknown }[] };
    const r = await withUser(deps.db, req.userId, (tx) => createObservation(tx, c, input));
    if (r.safety_flags.length) for (const f of r.safety_flags) deps.events.publish({ user_id: req.userId, type: 'safety.flag_raised', data: { flag_id: f.id, rule_key: f.rule_key } });
    // a meal containing the trial target raises the exposure prompt in the same request cycle (07 M5)
    return reply.status(r.created ? 201 : 200).send({ ...r.observation, safety_flags: r.safety_flags, trial_exposure: c.notes?.find((n) => n.trial_exposure)?.trial_exposure ?? null });
  });
  app.post('/observations/bulk', async (req) => {
    const items = z.array(ObservationInputSchema).max(500).parse(req.body);
    const out = { created: [] as string[], existing: [] as string[], rejected: [] as { client_id: string; detail: string }[] };
    for (const i of items) {
      try {
        const r = await withUser(deps.db, req.userId, (tx) => createObservation(tx, ctx(req), i));
        (r.created ? out.created : out.existing).push(r.observation.id);
      } catch (e) { out.rejected.push({ client_id: i.client_id, detail: (e as Error).message }); }
    }
    return out;
  });
  app.get('/observations', async (req) => {
    const q = z.object({ tracker_key: z.string().optional(), from: DateS.optional(), to: DateS.optional(), limit: z.coerce.number().int().min(1).max(500).default(50), cursor: z.string().optional() }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const where = ['deleted_at IS NULL']; const p: unknown[] = [];
      if (q.tracker_key) { p.push(q.tracker_key); where.push(`tracker_key = $${p.length}`); }
      if (q.from) { p.push(q.from); where.push(`local_day >= $${p.length}`); }
      if (q.to) { p.push(q.to); where.push(`local_day <= $${p.length}`); }
      if (q.cursor) { const [at, id] = Buffer.from(q.cursor, 'base64url').toString().split('|'); p.push(at, id); where.push(`(occurred_at, id) < ($${p.length - 1}::timestamptz, $${p.length}::uuid)`); }
      const totalP = p.slice(0, q.cursor ? -2 : undefined);
      const total = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM observation WHERE ${where.filter((w) => !w.startsWith('(occurred_at')).join(' AND ')}`, totalP)).rows[0]!.n;
      p.push(q.limit + 1);
      const data = await loadObservations(tx, deps, `${where.join(' AND ')} ORDER BY occurred_at DESC, id DESC LIMIT $${p.length}`, p);
      const page = data.slice(0, q.limit);
      const last = page[page.length - 1];
      return { data: page, total, next_cursor: data.length > q.limit && last ? Buffer.from(`${last.occurred_at}|${last.id}`).toString('base64url') : null };
    });
  });
  app.get('/observations/deleted', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const data = await loadObservations(tx, deps, `deleted_at > now() - interval '30 days' ORDER BY deleted_at DESC LIMIT 200`, []);
    return { data, total: data.length };
  }));
  app.get('/observations/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const o = await loadObservation(tx, deps, (req.params as { id: string }).id);
    if (!o) throw notFound('observation');
    return o;
  }));
  app.get('/observations/:id/revisions', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const data = await revisions(tx, deps, (req.params as { id: string }).id);
    return { data, total: data.length };
  }));
  app.patch('/observations/:id', async (req) => {
    const patch = ObservationPatchSchema.parse(req.body);
    const r = await withUser(deps.db, req.userId, (tx) => updateObservation(tx, ctx(req), (req.params as { id: string }).id, {
      occurred_at: patch.occurred_at, time_source: patch.time_source, note: patch.note, values: patch.values, meal_items: patch.meal_items,
      specificity: patch.specificity, base_revision: patch.base_revision }));
    return { ...r.observation, conflicts: r.conflicts, safety_flags: r.safety_flags };
  });
  app.delete('/observations/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const o = await deleteObservation(tx, ctx(req), (req.params as { id: string }).id);
    return { id: o.id, deleted_at: o.deleted_at, recoverable_until: new Date(Date.parse(o.deleted_at!) + 30 * 86400_000).toISOString() };
  }));
  app.post('/observations/:id/restore', async (req) => withUser(deps.db, req.userId, (tx) => restoreObservation(tx, ctx(req), (req.params as { id: string }).id)));
  app.post('/observations/:id/move', async (req) => {
    const { to_date } = z.object({ to_date: DateS }).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      const cur = await loadObservation(tx, deps, (req.params as { id: string }).id);
      if (!cur) throw notFound('observation');
      const user = await getUser(tx);
      // keep the wall-clock time, change the date (08 §5.3)
      const { zonedTimeToUtc, localSecondsOfDay } = await import('@foodtrack/shared');
      const secs = localSecondsOfDay(new Date(cur.occurred_at), user.timezone);
      const hhmm = `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}`;
      let at = zonedTimeToUtc(to_date, hhmm, user.timezone);
      if (localDay(at, { timezone: user.timezone, dayRollover: user.day_rollover }) !== to_date) at = new Date(at.getTime() + 86400_000);
      const r = await updateObservation(tx, ctx(req), cur.id, { occurred_at: at.toISOString(), time_source: cur.time_precision === 'exact' ? 'user_set' : 'default' }, 'move');
      return { ...r.observation, invalidated_days: [cur.local_day, r.observation.local_day] };
    });
  });
  app.delete('/batches/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM observation WHERE batch_id = $1 AND deleted_at IS NULL', [(req.params as { id: string }).id]);
    for (const r of rows) await deleteObservation(tx, ctx(req), r.id);
    return { deleted: rows.length };
  }));

  app.get('/timeline', async (req) => {
    const q = z.object({ from: DateS.optional(), to: DateS.optional(), limit: z.coerce.number().int().min(1).max(1000).default(300) }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const user = await getUser(tx);
      const today = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover });
      const from = q.from ?? addDays(today, -13); const to = q.to ?? today;
      const data = await loadObservations(tx, deps, 'local_day BETWEEN $1 AND $2 AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT $3', [from, to, q.limit]);
      const rollups = await rollupRange(tx, deps, from, to);
      return { from, to, data, days: rollups, total: data.length };
    });
  });
  app.get('/days', async (req) => {
    const q = z.object({ from: DateS, to: DateS }).parse(req.query);
    if (Date.parse(q.to) - Date.parse(q.from) > 400 * 86400_000) throw new HttpProblem(422, 'validation', 'Range too long', 'Ask for at most 400 days at a time.');
    return withUser(deps.db, req.userId, async (tx) => { const data = await rollupRange(tx, deps, q.from, q.to); return { data, total: data.length }; });
  });
  app.get('/days/:date', async (req) => {
    const date = DateS.parse((req.params as { date: string }).date);
    return withUser(deps.db, req.userId, async (tx) => {
      const observations = await loadObservations(tx, deps, 'local_day = $1 AND deleted_at IS NULL ORDER BY occurred_at', [date]);
      const [rollup] = await rollupRange(tx, deps, date, date);
      const { rows: events } = await tx.query(`SELECT id, kind, started_at, ended_at FROM event_marker WHERE started_at::date <= $1 AND coalesce(ended_at, started_at)::date >= $1`, [date]);
      const { rows: trial } = await tx.query(`SELECT t.id, t.status, t.target_label, td.phase, td.adherent, td.exposure_detected FROM trial t JOIN trial_day td ON td.trial_id = t.id WHERE td.local_day = $1`, [date]);
      return { date, observations, rollup: rollup ?? null, events, trial: trial[0] ?? null };
    });
  });
  app.get('/scores/daily', async (req) => {
    const q = z.object({ from: DateS, to: DateS }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const data = (await rollupRange(tx, deps, q.from, q.to)).map((d) => ({ local_day: d.local_day, score: d.score?.value ?? null, components: d.score?.components ?? [], day_weight: d.day_weight.value }));
      return { data, total: data.length, label: 'default_weighting' };
    });
  });
  app.get('/scores/:date/breakdown', async (req) => {
    const date = DateS.parse((req.params as { date: string }).date);
    return withUser(deps.db, req.userId, async (tx) => {
      const [d] = await rollupRange(tx, deps, date, date);
      return { local_day: date, score: d?.score ?? null, day_weight: d?.day_weight ?? null, note: 'default_weighting' };
    });
  });
}
