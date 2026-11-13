/**
 * Red-flag rules (01 US-09, CLAUDE.md safety). Evaluated on every write, driven by the
 * `safety` blocks in tracker definitions — no tracker key appears here. Red flags always
 * outrank insights and only ever say "see a doctor"; they are never pushed (08 §12.4).
 */
import type { FieldDef, TrackerDefinition } from '@foodtrack/tracker-schema';
import type { Tx } from '../db/pool.js';

export interface RaisedFlag { id: string; rule_key: string; observation_id: string | null; raised_at: string; detail: unknown }

const SUPPRESS_DAYS = 7;

async function alreadyActive(tx: Tx, rule: string): Promise<boolean> {
  const { rows } = await tx.query(
    `SELECT 1 FROM safety_flag WHERE rule_key = $1 AND (acknowledged_at IS NULL OR acknowledged_at > now() - make_interval(days => $2)) LIMIT 1`,
    [rule, SUPPRESS_DAYS]);
  return rows.length > 0;
}

async function raise(tx: Tx, rule: string, observationId: string, detail: Record<string, unknown>): Promise<RaisedFlag | null> {
  if (await alreadyActive(tx, rule)) return null;
  const { rows } = await tx.query<RaisedFlag>(
    `INSERT INTO safety_flag (user_id, rule_key, observation_id, detail) VALUES (app_current_user(), $1, $2, $3)
     RETURNING id, rule_key, observation_id, raised_at, detail`, [rule, observationId, detail]);
  const flag = rows[0]!;
  await tx.query(`INSERT INTO inbox_item (user_id, kind, ref_id, payload) VALUES (app_current_user(), 'safety_flag', $1, $2)`, [flag.id, { rule_key: rule }]);
  return flag;
}

function num(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

export async function evaluateSafety(
  tx: Tx, def: TrackerDefinition, observation: { id: string; local_day: string; values: Record<string, unknown> },
  profile: { birth_year: number | null },
): Promise<RaisedFlag[]> {
  const out: RaisedFlag[] = [];
  const push = (f: RaisedFlag | null) => { if (f) out.push(f); };
  for (const f of def.fields) {
    const s = f.safety; if (!s) continue;
    const v = observation.values[f.key];
    if (s.flag && v === true) push(await raise(tx, s.flag, observation.id, { tracker: def.key, field: f.key }));
    if (s.flag_map && typeof v === 'string' && s.flag_map[v]) push(await raise(tx, s.flag_map[v]!, observation.id, { tracker: def.key, field: f.key, value: v }));
    if (s.threshold && num(v) !== null && num(v)! >= s.threshold.gte) push(await raise(tx, s.threshold.rule, observation.id, { tracker: def.key, field: f.key, value: v }));
    if (s.persistent && num(v) !== null && num(v)! >= s.persistent.gte) {
      const where = s.persistent.where;
      if (!where || where.in.some((x) => x === observation.values[where.field])) {
        if (await persistentDays(tx, def, f, s.persistent.gte, s.persistent.days, observation.local_day, where)) {
          push(await raise(tx, s.persistent.rule, observation.id, { tracker: def.key, field: f.key, days: s.persistent.days }));
        }
      }
    }
    if (s.decline_pct && num(v) !== null) {
      const { rows } = await tx.query<{ peak: number | null }>(
        `SELECT max(v.value_num) AS peak FROM observation o JOIN observation_value v ON v.observation_id = o.id AND v.field_key = $2
         WHERE o.tracker_key = $1 AND o.deleted_at IS NULL AND o.id <> $3 AND o.local_day >= $4::date - make_interval(days => $5)`,
        [def.key, f.key, observation.id, observation.local_day, s.decline_pct.days]);
      const peak = rows[0]?.peak;
      if (peak && (peak - num(v)!) / peak >= s.decline_pct.pct / 100) {
        push(await raise(tx, s.decline_pct.rule, observation.id, { tracker: def.key, field: f.key, pct: Math.round(((peak - num(v)!) / peak) * 1000) / 10, days: s.decline_pct.days }));
      }
    }
  }
  // New symptoms over age 50: an outcome-recording tracker, a notable value, nothing similar in 90 days, and enough history to know.
  if (def.counts_as_outcome_record && profile.birth_year && new Date().getUTCFullYear() - profile.birth_year >= 50) {
    const sev = def.fields.find((f) => f.analysis?.role === 'outcome' && f.type === 'scale');
    const sel = def.group_by_field;
    const val = sev ? num(observation.values[sev.key]) : null;
    if (sev && val !== null && val >= 5) {
      const { rows } = await tx.query<{ prior: number; span: number }>(
        `SELECT count(*) FILTER (WHERE o.local_day >= $3::date - 90 AND ($4::text IS NULL OR EXISTS (
                  SELECT 1 FROM observation_value s WHERE s.observation_id = o.id AND s.field_key = $4 AND s.value_text = $5)))::int AS prior,
                coalesce($3::date - min(o.local_day), 0)::int AS span
         FROM observation o WHERE o.tracker_key = $1 AND o.deleted_at IS NULL AND o.id <> $2`,
        [def.key, observation.id, observation.local_day, sel ?? null, sel ? String(observation.values[sel] ?? '') : null]);
      if (rows[0] && rows[0].prior === 0 && rows[0].span >= 30) push(await raise(tx, 'red_flag_new_symptoms_over_50', observation.id, { tracker: def.key }));
    }
  }
  return out;
}

async function persistentDays(tx: Tx, def: TrackerDefinition, f: FieldDef, gte: number, days: number, day: string,
  where?: { field: string; in: (string | number)[] }): Promise<boolean> {
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(DISTINCT o.local_day)::int AS n FROM observation o
     JOIN observation_value v ON v.observation_id = o.id AND v.field_key = $2 AND v.value_num >= $3
     WHERE o.tracker_key = $1 AND o.deleted_at IS NULL AND o.local_day BETWEEN $4::date - ($5 - 1) AND $4::date
       AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM observation_value s WHERE s.observation_id = o.id AND s.field_key = $6
            AND (s.value_text = ANY($7::text[]) OR s.value_num::text = ANY($7::text[]))))`,
    [def.key, f.key, gte, day, days, where?.field ?? null, where ? where.in.map(String) : null]);
  return (rows[0]?.n ?? 0) >= days;
}
