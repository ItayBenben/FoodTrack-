/**
 * Day rollups computed from tracker definitions (I-08): per-tracker daily aggregates,
 * the day-quality weight w(d) (04 §2) and the Gut Day Score (04 §3). Nothing here names
 * a tracker; it reads `score_component`, `counts_as_outcome_record` and `counts_as_checkin`.
 */
import { aggregateTrackerDay, type TrackerDefinition } from '@foodtrack/tracker-schema';
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { loadObservations, type ObservationPayload } from './observations.js';
import type { RegisteredTracker } from '../registry.js';

export interface ScoreComponent { key: string; weight: number; value: number | null; penalty: number; labels: { en: string; he: string } }
export interface DayRollup {
  local_day: string;
  trackers: Record<string, Record<string, number | boolean | null>>;
  counts: Record<string, number>;
  day_weight: { value: number; meal_coverage: number; outcome_recorded: number; checkin_present: number };
  score: { value: number; components: ScoreComponent[]; label: 'default_weighting' } | null;
}

export function rollupDay(day: string, obs: ObservationPayload[], registry: Map<string, RegisteredTracker>, deps: Deps, medianMeals: number): DayRollup {
  const byTracker = new Map<string, ObservationPayload[]>();
  for (const o of obs) if (!o.deleted_at && o.local_day === day) { const a = byTracker.get(o.tracker_key) ?? []; a.push(o); byTracker.set(o.tracker_key, a); }
  const trackers: DayRollup['trackers'] = {}; const counts: Record<string, number> = {};
  let mealsLogged = 0; let outcomeRecorded = 0; let checkin = 0;
  const components = new Map<string, { value: number | null; labels: { en: string; he: string } }>();
  for (const [key, list] of byTracker) {
    const reg = registry.get(key); if (!reg) continue;
    const def: TrackerDefinition = reg.def;
    trackers[key] = aggregateTrackerDay(def, list.map((o) => ({ values: o.values })));
    counts[key] = list.length;
    if (def.has_meal_items) mealsLogged += list.length;
    if (def.counts_as_outcome_record) outcomeRecorded = 1;
    if (def.counts_as_checkin) { checkin = 1; if (list.some((o) => o.values.all_clear === true)) outcomeRecorded = 1; }
    for (const a of def.aggregation?.daily ?? []) {
      const comp = a.analysis?.score_component; if (!comp) continue;
      const raw = trackers[key]![a.key];
      const norm = raw === null || raw === undefined ? null : typeof raw === 'boolean' ? (raw ? 1 : 0) : Math.min(1, Math.max(0, Number(raw) / (a.analysis?.scale_max ?? 1)));
      const prev = components.get(comp);
      components.set(comp, { value: prev?.value == null ? norm : norm == null ? prev.value : Math.max(prev.value, norm), labels: a.analysis!.labels });
    }
  }
  const W = deps.analysis.day_weight;
  const mc = Math.min(1, mealsLogged / Math.max(1, medianMeals));
  const weight = W.meal_coverage * mc + W.outcome_recorded * outcomeRecorded + W.checkin_present * checkin;
  let score: DayRollup['score'] = null;
  if (outcomeRecorded) {
    const comps: ScoreComponent[] = Object.entries(deps.analysis.gut_day_score).map(([k, w]) => {
      const c = components.get(k); const v = c?.value ?? (k === 'symptom_load' || k === 'incompleteness' ? 0 : null);
      return { key: k, weight: w, value: v, penalty: v == null ? 0 : Math.round(w * v * 10) / 10, labels: c?.labels ?? { en: k, he: k } };
    });
    score = { value: Math.round(Math.max(0, Math.min(100, 100 - comps.reduce((s, c) => s + c.penalty, 0)))), components: comps, label: 'default_weighting' };
  }
  return { local_day: day, trackers, counts, day_weight: { value: Math.round(weight * 100) / 100, meal_coverage: Math.round(mc * 100) / 100, outcome_recorded: outcomeRecorded, checkin_present: checkin }, score };
}

export async function medianMealsPerDay(tx: Tx): Promise<number> {
  const { rows } = await tx.query<{ m: number | null }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS m FROM (
       SELECT local_day, count(*) AS n FROM observation WHERE tracker_key IN (SELECT key FROM tracker_definition WHERE definition->>'has_meal_items' = 'true')
         AND deleted_at IS NULL AND local_day > current_date - 60 GROUP BY local_day) d`);
  return rows[0]?.m ? Math.max(1, Number(rows[0].m)) : 3;
}

export async function rollupRange(tx: Tx, deps: Deps, from: string, to: string): Promise<DayRollup[]> {
  const registry = await deps.registry.forUser(tx);
  const obs = await loadObservations(tx, deps, 'local_day BETWEEN $1 AND $2 AND deleted_at IS NULL ORDER BY occurred_at', [from, to]);
  const median = await medianMealsPerDay(tx);
  const days = [...new Set(obs.map((o) => o.local_day))].sort();
  return days.map((d) => rollupDay(d, obs, registry, deps, median));
}
