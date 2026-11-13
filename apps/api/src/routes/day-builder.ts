/**
 * The day builder (08 §4.15, 03 §16): a whole day's meals in one pass, times prefilled from the
 * user's own slot medians and marked as estimates. One transaction, one batch, one undo.
 * Parsing is queued per slot; the save never waits on a model.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { localDay, uuidv7, zonedTimeToUtc } from '@foodtrack/shared';
import { withUser, type Tx } from '../db/pool.js';
import type { Deps } from '../app.js';
import { HttpProblem } from '../lib/problem.js';
import { createObservation, deleteObservation, loadObservations, updateObservation } from '../services/observations.js';
import { rollupRange } from '../services/days.js';
import { getUser } from '../services/users.js';
import { deviceId } from './guard.js';

const DateS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function slotTimes(tx: Tx, deps: Deps) {
  const meal = [...(await deps.registry.forUser(tx)).values()].find((t) => t.def.has_meal_items);
  if (!meal) throw new HttpProblem(404, 'no_meal_tracker', 'No meal tracker is enabled');
  const slotField = meal.def.fields.find((f) => f.key === 'slot' && f.type === 'enum');
  const slots = (slotField?.options ?? []).map((o) => String(o.value));
  const { rows } = await tx.query<{ slot: string; median_time: string; n: number }>(`SELECT slot, to_char(median_time, 'HH24:MI') AS median_time, n::int FROM my_slot_time`);
  const med = new Map(rows.map((r) => [r.slot, r]));
  const defaults = (deps.analysis.slot_default_times ?? {}) as Record<string, string>;
  return { tracker: meal.def.key, slots: slots.map((s) => ({ slot: s, median_time: med.get(s)?.median_time ?? null, n: med.get(s)?.n ?? 0, fallback_time: defaults[s] ?? '12:00' })) };
}

export async function dayBuilderRoutes(app: FastifyInstance) {
  const { deps } = app;

  app.get('/me/slot-times', async (req) => withUser(deps.db, req.userId, async (tx) => (await slotTimes(tx, deps))));

  app.get('/days/:date/builder', async (req) => {
    const date = DateS.parse((req.params as { date: string }).date);
    return withUser(deps.db, req.userId, async (tx) => {
      const { tracker, slots } = await slotTimes(tx, deps);
      const obs = await loadObservations(tx, deps, `local_day = $1 AND tracker_key = $2 AND deleted_at IS NULL ORDER BY occurred_at`, [date, tracker]);
      const [rollup] = await rollupRange(tx, deps, date, date);
      return {
        date, tracker,
        slots: slots.map((s) => ({ ...s, time_precision: s.n >= 3 ? 'slot_estimate' : 'day_only', observations: obs.filter((o) => o.values.slot === s.slot) })),
        unslotted: obs.filter((o) => !o.values.slot),
        missing: slots.filter((s) => !obs.some((o) => o.values.slot === s.slot) && s.slot !== 'snack' && s.slot !== 'drink').map((s) => s.slot),
        day_weight: rollup?.day_weight ?? { value: 0, meal_coverage: 0, outcome_recorded: 0, checkin_present: 0 },
      };
    });
  });

  app.post('/days/:date/builder', async (req) => {
    const date = DateS.parse((req.params as { date: string }).date);
    const b = z.object({ slots: z.array(z.object({
      slot: z.string().max(30), observation_id: z.string().uuid().nullable().optional(), text: z.string().max(1000),
      occurred_at: z.string().datetime({ offset: true }).optional(), time_source: z.enum(['slot_median', 'user_set', 'default']).default('slot_median'),
    })).max(12) }).parse(req.body);
    // One transaction: a half-saved day is worse than an unsaved one.
    return withUser(deps.db, req.userId, async (tx) => {
      const user = await getUser(tx);
      const { tracker, slots } = await slotTimes(tx, deps);
      const batch = uuidv7(); const ctx = { deps, deviceId: deviceId(req) };
      const out: { slot: string; observation_id: string | null; action: string }[] = [];
      for (const s of b.slots) {
        const info = slots.find((x) => x.slot === s.slot);
        if (!info) throw new HttpProblem(422, 'validation', `Unknown slot '${s.slot}'`);
        let at = s.occurred_at; let source: string = s.time_source;
        if (!at) {
          at = zonedTimeToUtc(date, info.median_time ?? info.fallback_time, user.timezone).toISOString();
          // no median yet → "day_only", never presented as a precise time (D31)
          if (!info.median_time) source = 'default';
          if (localDay(at, { timezone: user.timezone, dayRollover: user.day_rollover }) !== date) at = new Date(Date.parse(at) + 86400_000).toISOString();
        }
        if (s.observation_id) {
          if (!s.text.trim()) {
            await deleteObservation(tx, ctx, s.observation_id);
            await tx.query('UPDATE observation SET batch_id = $2 WHERE id = $1', [s.observation_id, batch]);
            out.push({ slot: s.slot, observation_id: s.observation_id, action: 'deleted' });
          } else {
            await updateObservation(tx, ctx, s.observation_id, { values: { description: s.text, slot: s.slot }, ...(s.time_source === 'user_set' && s.occurred_at ? { occurred_at: s.occurred_at, time_source: 'user_set' } : {}) });
            await tx.query(`UPDATE observation SET batch_id = $2, parse_status = 'pending' WHERE id = $1`, [s.observation_id, batch]);
            await tx.query(`DELETE FROM meal_item WHERE observation_id = $1`, [s.observation_id]);
            await tx.query(`INSERT INTO job (kind, user_id, payload, dedupe_key) VALUES ('parse_meal', app_current_user(), $1, $2) ON CONFLICT DO NOTHING`, [{ observation_id: s.observation_id }, `parse_meal:${s.observation_id}:${batch}`]);
            out.push({ slot: s.slot, observation_id: s.observation_id, action: 'updated' });
          }
        } else if (s.text.trim()) {
          const r = await createObservation(tx, ctx, { client_id: `builder_${batch}_${s.slot}`, tracker_key: tracker, occurred_at: at, time_source: source as 'slot_median' | 'user_set' | 'default', source: 'manual', values: { description: s.text.trim(), slot: s.slot }, batch_id: batch });
          out.push({ slot: s.slot, observation_id: r.observation.id, action: 'created' });
        }
      }
      return { batch_id: batch, results: out };
    });
  });

  /** Proposes a slot assignment for a pasted blob; creates nothing (03 §16.1). */
  app.post('/meals/parse-multiline', async (req) => {
    const { text } = z.object({ text: z.string().max(4000) }).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      const { slots } = await slotTimes(tx, deps);
      const meal = [...(await deps.registry.forUser(tx)).values()].find((t) => t.def.has_meal_items)!;
      const opts = meal.def.fields.find((f) => f.key === 'slot')?.options ?? [];
      const labelFor = new Map<string, string>();
      for (const o of opts) for (const l of [String(o.value), o.labels.en, o.labels.he]) labelFor.set(l.toLowerCase(), String(o.value));
      const taken = new Set<string>(); const out: { slot: string; text: string; time: string | null; reason: string }[] = [];
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const lab = line.match(/^([^:：]{2,20})[:：]\s*(.+)$/);
        if (lab && labelFor.has(lab[1]!.trim().toLowerCase())) { const sl = labelFor.get(lab[1]!.trim().toLowerCase())!; taken.add(sl); out.push({ slot: sl, text: lab[2]!, time: null, reason: 'label' }); continue; }
        const tm = line.match(/^(\d{1,2})[:.](\d{2})\s+(.+)$/);
        if (tm) {
          const mins = Number(tm[1]) * 60 + Number(tm[2]);
          const nearest = slots.map((s) => ({ s: s.slot, d: Math.abs(mins - (Number((s.median_time ?? s.fallback_time).slice(0, 2)) * 60 + Number((s.median_time ?? s.fallback_time).slice(3)))) })).sort((a, b) => a.d - b.d)[0]!;
          taken.add(nearest.s); out.push({ slot: nearest.s, text: tm[3]!, time: `${tm[1]!.padStart(2, '0')}:${tm[2]}`, reason: 'time' }); continue;
        }
        const free = slots.find((s) => !taken.has(s.slot));
        if (free) { taken.add(free.slot); out.push({ slot: free.slot, text: line, time: null, reason: 'order' }); }
        else out.push({ slot: 'snack', text: line, time: null, reason: 'overflow' });
      }
      return { proposal: out };
    });
  });
}
