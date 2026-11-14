/** Trends (05 U6, 08 §8.6): series for any tracker aggregation or chart the DEFINITIONS declare. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addDays, localDay } from '@foodtrack/shared';
import { withUser } from '../db/pool.js';
import { notFound } from '../lib/problem.js';
import { rollupRange } from '../services/days.js';
import { loadObservations } from '../services/observations.js';
import { getUser } from '../services/users.js';

export async function chartRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.get('/charts', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const reg = await deps.registry.forUser(tx);
    const { rows } = await tx.query<{ tracker_key: string }>('SELECT tracker_key FROM user_tracker WHERE enabled');
    const on = new Set(rows.map((r) => r.tracker_key));
    const data = [...reg.values()].filter((r) => on.has(r.def.key)).flatMap((r) => (r.def.charts ?? []).map((c, i) => ({ key: `${r.def.key}.${i}`, tracker: r.def.key, labels: r.def.labels, ...c })));
    return { data, total: data.length };
  }));
  app.get('/charts/:key', async (req) => {
    const key = (req.params as { key: string }).key;
    const q = z.object({ days: z.coerce.number().int().min(7).max(400).default(90) }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const [tracker, idx] = key.split('.');
      const reg = await deps.registry.get(tx, tracker!);
      const chart = reg?.def.charts?.[Number(idx)];
      if (!reg || !chart) throw notFound('chart');
      const user = await getUser(tx);
      const to = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover }); const from = addDays(to, -q.days + 1);
      if (chart.type === 'distribution' && chart.field) {
        const obs = await loadObservations(tx, deps, 'tracker_key = $1 AND local_day BETWEEN $2 AND $3 AND deleted_at IS NULL', [tracker, from, to]);
        const counts: Record<string, number> = {};
        for (const o of obs) { const v = o.values[chart.field]; if (v !== undefined && v !== null) counts[String(v)] = (counts[String(v)] ?? 0) + 1; }
        const field = reg.def.fields.find((f) => f.key === chart.field);
        return { type: 'distribution', from, to, bins: (field?.options ?? []).map((o) => ({ value: o.value, labels: o.labels, count: counts[String(o.value)] ?? 0 })) };
      }
      const days = await rollupRange(tx, deps, from, to);
      const aggKey = chart.aggregation ?? reg.def.aggregation?.daily.find((a) => a.field === chart.field && ['mean', 'last', 'max'].includes(a.op))?.key ?? chart.field;
      const series = days.map((d) => ({ day: d.local_day, value: d.trackers[tracker!]?.[aggKey!] ?? null }));
      return { type: chart.type, from, to, good_range: chart.good_range ?? null, unit: reg.def.fields.find((f) => f.key === chart.field)?.unit ?? null, series };
    });
  });
}
