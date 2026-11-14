/**
 * N-of-1 trials (04 §10–11, 08 §9). The pre-registration is frozen at start (a DB trigger enforces it);
 * the verdict is Bayesian and computed by the Python service; every guardrail of §11 refuses with a
 * machine-readable reason. A blinded (Design D) allocation is sealed with the DEK and NEVER leaves the
 * server before reveal — the one serializer below is the only way trial state reaches a client.
 */
import { randomInt } from 'node:crypto';
import { addDays, localDay } from '@foodtrack/shared';
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { getUser } from './users.js';
import { rollupRange } from './days.js';
import { postWriteHooks, type ObservationPayload } from './observations.js';
import { handlers, publish, systemHandlers } from '../workers/jobs.js';
import { anonymous, withUser } from '../db/pool.js';

export type Design = 'A' | 'B' | 'C' | 'D';
export interface Phase { phase: string; start: string; end: string; period_index?: number; dose?: { en: string; he: string } | null; label?: string }
interface Target { kind: 'food' | 'tag' | 'nutrient'; ref: string; label: { en: string; he: string } }

const TARGET_ABSENT = new Set(['elimination', 'washout', 'followup', 'off', 'control', 'challenge_blind_background']);
const cfgOf = (deps: Deps) => deps.analysis as Deps['analysis'] & { blinding_agents: Record<string, { agent: string; control: string; vehicle: string; dose: { en: string; he: string } }>; whole_group_tags: Record<string, string[]>; challenge_doses: Record<string, { en: string; he: string }[]> };

// ───────── phases ─────────
export function buildPhases(design: Design, start: string, o: { baselineDays: number; eliminationDays: number; washoutDays: number; challengeDays: number; followupDays: number; doses: { en: string; he: string }[]; order?: number[] }): Phase[] {
  const out: Phase[] = []; let d = start;
  const push = (phase: string, n: number, extra: Partial<Phase> = {}) => { if (n <= 0) return; out.push({ phase, start: d, end: addDays(d, n - 1), ...extra }); d = addDays(d, n); };
  if (design === 'A') {
    push('baseline', o.baselineDays); push('elimination', o.eliminationDays); push('washout', o.washoutDays);
    for (let i = 0; i < o.challengeDays; i++) push('challenge', 1, { period_index: 0, dose: o.doses[Math.min(i, o.doses.length - 1)] ?? null });
    push('followup', o.followupDays);
  } else if (design === 'B') {
    push('baseline', o.baselineDays);
    // 6 blocks of 4 days, counterbalanced in pairs (ABBA BAAB …) — randomised from 4 blocks (§10.2)
    const pairs = [0, 1, 2].map(() => (randomInt(2) ? ['on', 'off'] : ['off', 'on'])).flat();
    pairs.forEach((p, i) => push(p, 4, { period_index: i }));
  } else if (design === 'C') {
    const levels = ['habitual', 'half', 'quarter'];
    const order = o.order ?? [0, 1, 2].sort(() => randomInt(3) - 1);
    order.forEach((k, i) => push(levels[k]!, 5, { period_index: i }));
  } else {
    push('elimination', Math.max(7, Math.min(o.eliminationDays, 14)));
    for (let i = 0; i < 6; i++) { push('challenge', 3, { period_index: i, label: `A${i + 1}` }); if (i < 5) push('washout', 3); }
    push('followup', o.followupDays);
  }
  return out;
}

function phaseOn(phases: Phase[], day: string): Phase | null { return phases.find((p) => p.start <= day && day <= p.end) ?? null; }

// ───────── serializer: the ONLY way a trial leaves the server (02 §12.3) ─────────
export function trialView(r: Record<string, unknown>) {
  const revealed = Boolean(r.revealed_at);
  const { allocation_key: _never, abandon_reason: _enc, ...rest } = r as Record<string, unknown> & { allocation_key?: unknown; abandon_reason?: unknown };
  const verdict = r.design === 'D' && !revealed ? null : r.verdict;
  return { ...rest, verdict, allocation: undefined, open_label: r.design !== 'D' };
}

// ───────── guardrails (04 §11) ─────────
async function guard(tx: Tx, deps: Deps, target: Target) {
  if (!['food', 'tag', 'nutrient'].includes(target.kind)) {
    // never a suggestion to start, stop or change a medication — trials are for foods only
    throw new HttpProblem(422, 'medication_never', 'Trials are only for foods', 'Your data shows a pattern around this. That’s worth showing to whoever prescribed it — don’t change it on your own.', undefined, { reason: 'medication_never' });
  }
  const active = await tx.query<{ id: string; target_label: { en: string }; started_at: Date }>(`SELECT id, target_label, started_at FROM trial WHERE status IN ('active','paused') LIMIT 1`);
  if (active.rows[0]) throw new HttpProblem(409, 'active_trial_exists', 'A trial is already running', 'Running two at once means neither answer is trustworthy.', undefined, { reason: 'active_trial_exists', trial_id: active.rows[0].id, target_label: active.rows[0].target_label });
  const recent = await tx.query(`SELECT 1 FROM avoid_entry WHERE removed_at IS NULL AND ref = $1 AND added_at > now() - make_interval(days => $2)`, [target.ref, deps.analysis.avoid_list_suppression_days]);
  if (recent.rows[0]) throw new HttpProblem(409, 'avoid_list_recent', 'Already on your avoid list', 'This was added to your avoid list recently; a new trial on it is held back for 90 days.', undefined, { reason: 'avoid_list_recent' });
  const load = await tx.query<{ n: number; labels: { en: string; he: string }[] }>(`SELECT count(*)::int AS n, coalesce(json_agg(label), '[]') AS labels FROM avoid_entry WHERE removed_at IS NULL`);
  if (load.rows[0]!.n >= deps.analysis.max_concurrent_eliminations) throw new HttpProblem(409, 'elimination_cap', 'Already avoiding enough', 'Adding a fourth makes it very hard to tell which one matters — and hard to eat well. Bring one back first.', undefined, { reason: 'elimination_cap', avoiding: load.rows[0]!.labels });
  if (await restrictionWatch(tx)) throw new HttpProblem(409, 'restriction_watch', 'Not now', 'You’re eating a narrower range than you used to, so new eliminations are paused for now.', undefined, { reason: 'restriction_watch' });
}

/** §11.5: distinct foods per week down > 40% from the user's own baseline. */
export async function restrictionWatch(tx: Tx): Promise<boolean> {
  const { rows } = await tx.query<{ wk: number; n: number }>(`SELECT (current_date - o.local_day) / 7 AS wk, count(DISTINCT mi.food_id)::int AS n
    FROM observation o JOIN meal_item mi ON mi.observation_id = o.id WHERE o.deleted_at IS NULL AND o.local_day > current_date - 63 AND mi.food_id IS NOT NULL GROUP BY 1`);
  const now = rows.find((r) => r.wk === 0)?.n ?? null; const past = rows.filter((r) => r.wk >= 1).map((r) => r.n).sort((a, b) => a - b);
  if (now === null || past.length < 4) return false;
  const median = past[Math.floor(past.length / 2)]!;
  return median > 0 && now < median * 0.6;
}

// ───────── proposal ─────────
export async function propose(tx: Tx, deps: Deps, input: { insight_id?: string; target?: Target; preferred_design?: Design; primary_outcome?: string }) {
  const cfg = cfgOf(deps);
  let target: Target; let outcome = input.primary_outcome; let prevalence = 0.3; let originId: string | null = null; let outcomeType: 'binary' | 'continuous' = 'binary';
  if (input.insight_id) {
    const { rows } = await tx.query<{ id: string; exposure_kind: string; exposure_ref: string; exposure_label: { en: string; he: string }; outcome_ref: string; effect_type: string; n_exposed: number; n_unexposed: number; confidence: string }>(
      'SELECT id, exposure_kind, exposure_ref, exposure_label, outcome_ref, effect_type, n_exposed, n_unexposed, confidence FROM association WHERE id = $1', [input.insight_id]);
    const a = rows[0]; if (!a) throw notFound('insight');
    target = { kind: a.exposure_kind as Target['kind'], ref: a.exposure_ref.split(':').slice(1).join(':'), label: a.exposure_label };
    outcome ??= a.outcome_ref; outcomeType = a.effect_type === 'risk_difference' ? 'binary' : 'continuous';
    prevalence = a.n_exposed / (a.n_exposed + a.n_unexposed); originId = a.id;
  } else if (input.target) { target = input.target; outcome ??= 'stool.any_abnormal'; }
  else throw new HttpProblem(422, 'validation', 'Choose what to test');
  await guard(tx, deps, target);

  const T = cfg.trial_default;
  const user = await getUser(tx);
  const today = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover });
  // reuse the last 14 days as the baseline when they are well logged (§15.1)
  const recent = await rollupRange(tx, deps, addDays(today, -14), addDays(today, -1));
  const coverage = recent.filter((d) => d.day_weight.outcome_recorded).length / 14;
  const reuse = coverage >= 0.7;
  const blinding = cfg.blinding_agents[target.ref];
  const design: Design = input.preferred_design === 'D' && blinding ? 'D' : prevalence >= cfg.design_b_prevalence_threshold ? 'B' : (input.preferred_design && input.preferred_design !== 'D' ? input.preferred_design : 'A');
  const doses = cfg.challenge_doses[target.ref] ?? cfg.challenge_doses.default!;
  const start = addDays(today, 1);
  const phases = buildPhases(design, start, { baselineDays: reuse ? 0 : T.baseline_days, eliminationDays: T.elimination_days, washoutDays: T.washout_days, challengeDays: T.challenge_days, followupDays: T.followup_days, doses });
  // the binary trial bar (20 pp) is deliberately higher than the observational one (§14.3)
  const outcomeVals = recent.map((d) => { const [tr, agg] = outcome!.replace(/_notable$/, '').split('.'); return Number(d.trackers[tr!]?.[agg!] ?? 0); });
  const sd = Math.sqrt(outcomeVals.reduce((s, v, _i, a) => s + (v - a.reduce((x, y) => x + y, 0) / a.length) ** 2, 0) / Math.max(1, outcomeVals.length - 1)) || 1;
  const mie = outcomeType === 'binary' || outcome!.endsWith('_notable') ? cfg.trial_min_interesting_rd : Math.round(0.5 * sd * 100) / 100;
  if (outcome!.endsWith('_notable')) outcomeType = 'binary';
  const pBase = outcomeType === 'binary' ? Math.min(0.9, Math.max(0.05, outcomeVals.filter((v) => v > 0).length / Math.max(1, outcomeVals.length))) : 0.3;
  const onDays = phases.filter((p) => ['baseline', 'challenge', 'on', 'habitual'].includes(p.phase)).reduce((s, p) => s + dayCount(p), 0) + (reuse ? 14 : 0);
  const offDays = phases.filter((p) => ['elimination', 'off', 'quarter', 'control'].includes(p.phase)).reduce((s, p) => s + dayCount(p), 0);
  let power: { power: number; adequate: boolean } | null = null;
  try {
    const r = await fetch(`${deps.env.ANALYSIS_URL}/analyze/trial-power`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on_days: onDays, off_days: offDays, p_base: pBase, log_rate: Math.max(0.5, coverage), mie }), signal: AbortSignal.timeout(15000) });
    if (r.ok) power = await r.json() as typeof power;
  } catch { /* the proposal still works; the power line says it could not be computed */ }
  const groupNutrients = cfg.whole_group_tags[target.ref] ?? null;
  const hypothesis = {
    primary_outcome: outcome, outcome_type: outcomeType, direction: 'decrease_during_elimination', minimum_interesting_effect: mie, rope: [-mie, mie],
    min_adherence: T.min_adherence, min_days_logged: T.min_days_logged, analysis: outcomeType === 'binary' ? 'bayesian_beta_binomial' : 'bayesian_student_t',
    decision_bar: cfg.trial_decision_bar, analytic_washout_k: T.analytic_washout_k, baseline_reused: reuse, design,
  };
  return {
    origin_association_id: originId, target, design, primary_outcome: outcome, hypothesis, phases, start_date: start,
    total_days: phases.reduce((s, p) => s + dayCount(p), 0), baseline_reused: reuse, baseline_window: reuse ? [addDays(today, -14), addDays(today, -1)] : null,
    power, nutrition_note: groupNutrients ? { nutrients: groupNutrients } : null,
    blinding: { available: Boolean(blinding), agent: blinding?.agent ?? null, control: blinding?.control ?? null, vehicle: blinding?.vehicle ?? null, dose: blinding?.dose ?? null,
      prep_guide_key: blinding ? `blinding.prep.${blinding.vehicle}` : null, unavailable_reason: blinding ? null : 'no_isolated_form' },
    adjustable: { elimination_days: [cfg.trial_min_days_per_phase, 35], reuse_baseline: reuse, start_date: true, primary_outcome: true },
    locked: ['minimum_interesting_effect', 'min_adherence', 'reintroduction', 'target'],
  };
}
const dayCount = (p: Phase) => (Date.parse(p.end) - Date.parse(p.start)) / 86400_000 + 1;

// ───────── create & start ─────────
export async function createTrial(tx: Tx, deps: Deps, body: { insight_id?: string; target?: Target; preferred_design?: Design; elimination_days?: number; reuse_baseline?: boolean; start_date?: string; primary_outcome?: string; minimum_interesting_effect?: number; min_adherence?: number }) {
  const p = await propose(tx, deps, body);
  const cfg = cfgOf(deps);
  if (body.minimum_interesting_effect !== undefined && body.minimum_interesting_effect !== p.hypothesis.minimum_interesting_effect) throw new HttpProblem(422, 'locked', 'The minimum effect is fixed', 'It is set before the data is seen, so the answer can’t move.');
  if (body.min_adherence !== undefined && body.min_adherence !== p.hypothesis.min_adherence) throw new HttpProblem(422, 'locked', 'Minimum adherence is fixed');
  const elim = body.elimination_days ?? cfg.trial_default.elimination_days;
  if (elim < cfg.trial_min_days_per_phase) throw new HttpProblem(422, 'too_short', 'That is too short to answer the question', `${cfg.trial_min_days_per_phase} days is the shortest elimination that can come back with an answer instead of “inconclusive”.`);
  if (elim > 35) throw new HttpProblem(422, 'too_long', 'At most 35 days');
  const reuse = body.reuse_baseline ?? p.baseline_reused;
  const start = body.start_date ?? p.start_date;
  const doses = cfg.challenge_doses[p.target.ref] ?? cfg.challenge_doses.default!;
  const T = cfg.trial_default;
  const phases = buildPhases(p.design, start, { baselineDays: reuse && p.baseline_reused ? 0 : T.baseline_days, eliminationDays: elim, washoutDays: T.washout_days, challengeDays: T.challenge_days, followupDays: T.followup_days, doses });
  const hypothesis = { ...p.hypothesis, baseline_reused: reuse && p.baseline_reused, elimination_days: elim, prespecified_at: new Date().toISOString() };
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO trial (user_id, origin_association_id, target_kind, target_ref, target_label, design, primary_outcome, hypothesis, baseline_start, baseline_end, phases, status, analytic_washout_k)
     VALUES (app_current_user(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'proposed', $11) RETURNING id`,
    [p.origin_association_id, p.target.kind, p.target.ref, p.target.label, p.design, p.primary_outcome, hypothesis, p.baseline_window?.[0] ?? null, p.baseline_window?.[1] ?? null, JSON.stringify(phases), T.analytic_washout_k]);
  const id = rows[0]!.id;
  if (p.design === 'D') {
    // sealed allocation: 6 periods, randomised in pairs, key sealed with the DEK, never in any payload
    const arms = [0, 1, 2].flatMap(() => (randomInt(2) ? ['active', 'control'] : ['control', 'active']));
    await tx.query(`UPDATE trial SET allocation_key = $2, allocation_sealed = true, sealed_at = now() WHERE id = $1`, [id, deps.keys.crypto.seal('trial', 'allocation', id, JSON.stringify(arms))]);
  }
  if (p.origin_association_id) await tx.query(`UPDATE association SET outcome_state = 'testing' WHERE id = $1`, [p.origin_association_id]);
  return id;
}

export async function startTrial(tx: Tx, deps: Deps, id: string) {
  const t = await getTrialRow(tx, id);
  if (t.status !== 'proposed') throw new HttpProblem(409, 'not_proposed', 'Already started');
  await guardStart(tx, id);
  await tx.query(`UPDATE trial SET status = 'active', started_at = now() WHERE id = $1`, [id]);
  for (const p of t.phases as Phase[]) {
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) {
      await tx.query(`INSERT INTO trial_day (trial_id, user_id, local_day, phase, period_index, assigned_dose) VALUES ($1, app_current_user(), $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [id, d, p.phase, p.period_index ?? null, p.dose ? JSON.stringify(p.dose) : null]);
    }
  }
  await markAnalyticExclusions(tx, id, t.analytic_washout_k as number);
}
async function guardStart(tx: Tx, id: string) {
  const a = await tx.query(`SELECT 1 FROM trial WHERE status IN ('active','paused') AND id <> $1`, [id]);
  if (a.rows[0]) throw new HttpProblem(409, 'active_trial_exists', 'A trial is already running', 'Finish or stop it first.', undefined, { reason: 'active_trial_exists' });
}

/** The analytic washout (§10.7): the first k days of each period are dropped from the likelihood. */
async function markAnalyticExclusions(tx: Tx, id: string, k: number) {
  if (!k) return;
  await tx.query(`WITH runs AS (SELECT local_day, phase, local_day - (row_number() OVER (PARTITION BY phase, coalesce(period_index, -1) ORDER BY local_day))::int AS grp, period_index FROM trial_day WHERE trial_id = $1),
    ranked AS (SELECT local_day, row_number() OVER (PARTITION BY phase, grp ORDER BY local_day) AS rn, phase FROM runs)
    UPDATE trial_day td SET analytic_excluded = true FROM ranked r WHERE td.trial_id = $1 AND td.local_day = r.local_day AND r.rn <= $2 AND r.phase IN ('elimination','off','on','habitual','half','quarter','challenge')`, [id, k]);
}

export async function getTrialRow(tx: Tx, id: string): Promise<Record<string, unknown>> {
  const { rows } = await tx.query('SELECT * FROM trial WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('trial');
  return rows[0];
}

// ───────── exposure detection on every meal write (03 §7) ─────────
export interface TrialNote { trial_id: string; local_day: string; target_label: { en: string; he: string }; items: string[] }
postWriteHooks.push(async (tx, ctx, obs: ObservationPayload, def) => {
  if (!def.has_meal_items || obs.deleted_at) return;
  const { rows: t } = await tx.query<{ id: string; target_kind: string; target_ref: string; target_label: { en: string; he: string }; design: string }>(`SELECT id, target_kind, target_ref, target_label, design FROM trial WHERE status = 'active'`);
  const trial = t[0]; if (!trial) return;
  const { rows: day } = await tx.query<{ phase: string }>('SELECT phase FROM trial_day WHERE trial_id = $1 AND local_day = $2', [trial.id, obs.local_day]);
  const phase = day[0]?.phase; if (!phase) return;
  const absent = TARGET_ABSENT.has(phase) || (trial.design === 'D' && phase === 'challenge');
  if (!absent) return;
  const ids = (obs.meal_items ?? []).map((i) => i.food_id).filter(Boolean) as string[];
  if (!ids.length) return;
  let hits: string[] = [];
  if (trial.target_kind === 'food') hits = (obs.meal_items ?? []).filter((i) => i.food_id === trial.target_ref).map((i) => i.raw_text);
  else if (trial.target_kind === 'tag') {
    const { rows } = await tx.query<{ food_id: string }>(`SELECT food_id::text FROM my_food_tag_resolved WHERE tag = $1 AND food_id = ANY($2::uuid[])`, [trial.target_ref, ids]);
    const set = new Set(rows.map((r) => r.food_id));
    hits = (obs.meal_items ?? []).filter((i) => i.food_id && set.has(i.food_id)).map((i) => i.raw_text);
  }
  if (!hits.length) return;
  await tx.query(`UPDATE trial_day SET exposure_detected = true, adherent = false WHERE trial_id = $1 AND local_day = $2`, [trial.id, obs.local_day]);
  const note: TrialNote = { trial_id: trial.id, local_day: obs.local_day, target_label: trial.target_label, items: hits };
  (ctx as { notes?: unknown[] }).notes ??= []; (ctx as { notes?: unknown[] }).notes!.push({ trial_exposure: note });
  await publish(ctx.deps, tx, String((await tx.query<{ u: string }>('SELECT app_current_user()::text AS u')).rows[0]!.u), 'trial.exposure_detected', note);
});

// ───────── daily evaluation, washout gate, completion ─────────
function outcomeOf(rollup: Awaited<ReturnType<typeof rollupRange>>[number] | undefined, ref: string): number | null {
  if (!rollup || !rollup.day_weight.outcome_recorded) return null;
  const notable = ref.endsWith('_notable');
  const [tr, agg] = ref.replace(/_notable$/, '').split('.');
  const v = rollup.trackers[tr!]?.[agg!];
  if (v === null || v === undefined) return notable ? 0 : (typeof v === 'boolean' ? 0 : 0);
  const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
  return notable ? (n >= 5 ? 1 : 0) : n;
}

export async function evaluateTrial(tx: Tx, deps: Deps, id: string): Promise<{ status: string; phase: string | null; changed: boolean }> {
  const t = await getTrialRow(tx, id);
  if (!['active', 'paused'].includes(String(t.status))) return { status: String(t.status), phase: null, changed: false };
  const user = await getUser(tx);
  const today = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover });
  const phases = t.phases as Phase[];
  const first = phases[0]!.start; const last = phases[phases.length - 1]!.end;
  const rollups = await rollupRange(tx, deps, first, today);
  const byDay = new Map(rollups.map((r) => [r.local_day, r]));
  const ref = String(t.primary_outcome);
  for (let d = first; d <= today && d <= last; d = addDays(d, 1)) {
    const r = byDay.get(d); const v = outcomeOf(r, ref);
    await tx.query(`UPDATE trial_day SET logged = $3, outcome_value = $4, adherent = CASE WHEN adherent IS NULL AND phase = ANY($5::text[]) AND NOT exposure_detected THEN $6 ELSE adherent END
      WHERE trial_id = $1 AND local_day = $2`, [id, d, v !== null, v, [...TARGET_ABSENT], d < today && v !== null]);
  }
  // symptom-gated washout (§10.7): extend one day at a time while the outcome hasn't settled, capped
  const cur = phaseOn(phases, today);
  let changed = false;
  if (cur?.phase === 'washout' && today === cur.end && String(t.status) === 'active') {
    const gate = await washoutStatus(tx, deps, id);
    if (gate.recommendation === 'extend') { await shiftFrom(tx, id, phases, today, 1); changed = true; }
    if (gate.recommendation === 'review') await publish(deps, tx, user.id, 'trial.washout_stalled', { trial_id: id });
  }
  const prevPhase = phaseOn(phases, addDays(today, -1))?.phase ?? null;
  if (cur && prevPhase && cur.phase !== prevPhase) { await publish(deps, tx, user.id, 'trial.phase_changed', { trial_id: id, phase: t.design === 'D' && cur.phase === 'challenge' ? 'challenge' : cur.phase }); changed = true; }
  if (today > last && String(t.status) === 'active') { await finish(tx, deps, id, 'completed'); return { status: 'completed', phase: null, changed: true }; }
  return { status: String(t.status), phase: cur?.phase ?? null, changed };
}

async function shiftFrom(tx: Tx, id: string, phases: Phase[], fromDay: string, n: number) {
  const next = phases.map((p) => (p.end < fromDay ? p : p.start > fromDay ? { ...p, start: addDays(p.start, n), end: addDays(p.end, n) } : { ...p, end: addDays(p.end, n) }));
  await tx.query(`UPDATE trial SET phases = $2, washout_days_actual = coalesce(washout_days_actual, 0) + $3 WHERE id = $1`, [id, JSON.stringify(next), n]);
  await tx.query(`DELETE FROM trial_day WHERE trial_id = $1 AND local_day > $2`, [id, fromDay]);
  for (const p of next) for (let d = p.start; d <= p.end; d = addDays(d, 1)) if (d > fromDay)
    await tx.query(`INSERT INTO trial_day (trial_id, user_id, local_day, phase, period_index, assigned_dose) VALUES ($1, app_current_user(), $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [id, d, p.phase, p.period_index ?? null, p.dose ? JSON.stringify(p.dose) : null]);
}

export async function washoutStatus(tx: Tx, deps: Deps, id: string) {
  const t = await getTrialRow(tx, id);
  const { rows } = await tx.query<{ phase: string; outcome_value: number | null; local_day: string }>(`SELECT phase, outcome_value, local_day FROM trial_day WHERE trial_id = $1 ORDER BY local_day`, [id]);
  const elim = rows.filter((r) => r.phase === 'elimination' && r.outcome_value !== null).map((r) => Number(r.outcome_value));
  const wash = rows.filter((r) => r.phase === 'washout' && r.outcome_value !== null).map((r) => Number(r.outcome_value));
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const base = mean(elim); const current = mean(wash.slice(-2));
  const hyp = t.hypothesis as { minimum_interesting_effect: number };
  const delta = Number(t.washout_gate_delta ?? hyp.minimum_interesting_effect / 2);
  const elapsed = rows.filter((r) => r.phase === 'washout').length;
  const cap = Number(deps.analysis.washout_cap_days);
  const met = base !== null && current !== null && Math.abs(current - base) <= delta;
  const recommendation = met ? 'proceed' : elapsed >= cap ? 'review' : current === null ? 'wait' : 'extend';
  return { gate_met: met, current_value: current, baseline_value: base, delta, days_elapsed: elapsed, days_cap: cap, recommendation };
}

export async function finish(tx: Tx, deps: Deps, id: string, status: 'completed' | 'stopped_early') {
  const t = await getTrialRow(tx, id);
  const user = await getUser(tx);
  const today = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover });
  const hyp = t.hypothesis as Record<string, unknown>;
  const { rows: days } = await tx.query<{ local_day: string; phase: string; period_index: number | null; outcome_value: number | null; logged: boolean; adherent: boolean | null; analytic_excluded: boolean }>(
    `SELECT local_day, phase, period_index, outcome_value, logged, adherent, analytic_excluded FROM trial_day WHERE trial_id = $1 AND local_day < $2 ORDER BY local_day`, [id, today]);
  let allocation: string[] | null = null;
  if (t.allocation_key) allocation = JSON.parse(deps.keys.crypto.open('trial', 'allocation', id, t.allocation_key as Buffer)!);
  // reused baseline days count as the exposed arm (§15.1)
  const baseline: typeof days = [];
  if (hyp.baseline_reused && t.baseline_start) {
    const r = await rollupRange(tx, deps, String(t.baseline_start), String(t.baseline_end));
    for (const x of r) { const v = outcomeOf(x, String(t.primary_outcome)); baseline.push({ local_day: x.local_day, phase: 'baseline', period_index: null, outcome_value: v, logged: v !== null, adherent: null, analytic_excluded: false }); }
  }
  const payloadDays = [...baseline, ...days].map((d) => ({
    phase: allocation && d.phase === 'challenge' && d.period_index !== null ? allocation[d.period_index] : d.phase,
    period_index: d.period_index, outcome: d.outcome_value === null ? null : Number(d.outcome_value), logged: d.logged, adherent: d.adherent, analytic_excluded: d.analytic_excluded,
  }));
  const { rows: guesses } = await tx.query<{ period_index: number; guess: string }>('SELECT period_index, guess FROM trial_period_guess WHERE trial_id = $1', [id]);
  const total = (t.phases as Phase[]).reduce((s, p) => s + dayCount(p), 0);
  const partial = status === 'stopped_early' ? { stopped_on_day: days.length, of_days: total } : null;
  let verdict: Record<string, unknown>;
  try {
    const r = await fetch(`${deps.env.ANALYSIS_URL}/analyze/trial`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ days: payloadDays, hypothesis: hyp, outcome_type: hyp.outcome_type ?? 'binary', guesses, allocation, partial }) });
    if (!r.ok) throw new Error(String(r.status));
    verdict = await r.json() as Record<string, unknown>;
  } catch (e) {
    await tx.query(`INSERT INTO job (kind, user_id, payload, run_after, dedupe_key) VALUES ('trial_verdict_retry', app_current_user(), $1, now() + interval '10 minutes', $2) ON CONFLICT DO NOTHING`, [{ trial_id: id, status }, `verdict:${id}`]);
    throw new HttpProblem(503, 'analysis_unavailable', 'The verdict could not be computed yet', `It will be retried automatically (${(e as Error).message}). Nothing about the trial was lost.`);
  }
  verdict.design = t.design; verdict.open_label = t.design !== 'D';
  verdict.washout_days_actual = t.washout_days_actual ?? null; verdict.deviations = t.deviations;
  verdict.limitations = ['single_participant', t.design === 'D' ? 'blinded' : 'open_label', 'expectation_effects', 'not_generalisable', 'carryover_not_estimated', ...(partial ? ['stopped_early'] : [])];
  await tx.query(`UPDATE trial SET status = $2, completed_at = now(), verdict = $3 WHERE id = $1`, [id, status, verdict]);
  const v = String(verdict.verdict);
  if (t.origin_association_id) await tx.query(`UPDATE association SET outcome_state = $2 WHERE id = $1`, [t.origin_association_id, v === 'effect' ? 'confirmed' : v === 'no_meaningful_effect' || v === 'probably_not' ? 'ruled_out' : null]);
  // a "no meaningful effect" closes the loop: the food comes off any active restriction (§10.8)
  if (v === 'no_meaningful_effect' || v === 'probably_not') await tx.query(`UPDATE avoid_entry SET removed_at = now() WHERE ref = $1 AND removed_at IS NULL`, [t.target_ref]);
  // D43: tolerance is not permanent — re-test a "fail" verdict later, this posterior as the next prior
  if (v === 'effect' || v === 'probable') await tx.query(`INSERT INTO job (kind, user_id, payload, run_after) VALUES ('trial_retest_reminder', app_current_user(), $1, now() + interval '180 days')`, [{ trial_id: id }]);
  await tx.query(`INSERT INTO inbox_item (user_id, kind, ref_id, payload) VALUES (app_current_user(), 'trial_verdict', $1, $2)`, [id, { status }]);
  await publish(deps, tx, user.id, 'trial.phase_changed', { trial_id: id, phase: status });
}

handlers.set('trial_verdict_retry', async (tx, deps, p) => { await finish(tx, deps, String(p.trial_id), p.status as 'completed'); return { ok: true }; });
handlers.set('trial_retest_reminder', async (tx, _deps, p) => { await tx.query(`INSERT INTO inbox_item (user_id, kind, ref_id, payload) VALUES (app_current_user(), 'trial_retest', $1, '{}')`, [p.trial_id]); return { ok: true }; });
handlers.set('trial_evaluate', async (tx, deps, p) => evaluateTrial(tx, deps, String(p.trial_id)));
systemHandlers.set('trials_daily', async (deps) => {
  const users = await anonymous(deps.db, async (tx) => (await tx.query<{ user_id: string }>(`SELECT user_id FROM job_users_with_activity(interval '1 day')`)).rows);
  let n = 0;
  for (const u of users) await withUser(deps.db, u.user_id, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(`SELECT id FROM trial WHERE status = 'active'`);
    for (const r of rows) { await evaluateTrial(tx, deps, r.id).catch(() => undefined); n++; }
  });
  return { evaluated: n };
});
