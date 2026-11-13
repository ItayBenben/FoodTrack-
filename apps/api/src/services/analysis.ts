/**
 * Analysis runs (03 §6). The API asks the Python service; the service reads Postgres as the app role.
 * Results land in `association`; narratives are generated from NUMBERS only, validated, and sealed.
 */
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';
import { handlers, publish, systemHandlers } from '../workers/jobs.js';
import { withUser, anonymous } from '../db/pool.js';

export async function requestRun(tx: Tx, params: Record<string, unknown> = {}): Promise<{ run_id: string; in_flight: boolean }> {
  const inflight = await tx.query<{ id: string }>(`SELECT id FROM analysis_run WHERE status = 'running' AND started_at > now() - interval '30 minutes'`);
  if (inflight.rows[0]) return { run_id: inflight.rows[0].id, in_flight: true };
  await tx.query(`UPDATE analysis_run SET status = 'failed', error = 'timed out' WHERE status = 'running'`);
  const { rows } = await tx.query<{ id: string }>(`INSERT INTO analysis_run (user_id, engine_version, params) VALUES (app_current_user(), 'pending', $1) RETURNING id`, [params]);
  await tx.query(`INSERT INTO job (kind, user_id, payload, max_attempts) VALUES ('run_analysis', app_current_user(), $1, 2)`, [{ run_id: rows[0]!.id }]);
  return { run_id: rows[0]!.id, in_flight: false };
}

interface EngineAssoc {
  exposure_ref: string; exposure_label: { en: string; he: string }; outcome_ref: string; outcome_label: { en: string; he: string }; lag_window: [number, number];
  n_exposed: number; n_unexposed: number; n_outcome_exposed: number; n_outcome_unexposed: number; effect_type: string; effect: number; ci_low: number; ci_high: number;
  p_value: number; q_value: number; rho_1: number; attenuation: number | null; adjusted_for: string[]; warnings: { code: string; detail?: unknown }[]; confidence: string;
  evidence: Record<string, unknown>; reverse?: unknown; dose_response?: unknown; replication?: unknown; overlapping_events?: unknown[]; adjusted_effect?: number; standardized: number;
}

export function narrativePayload(a: EngineAssoc) {
  const ev = a.evidence as Record<string, number>;
  return {
    exposure_label: a.exposure_label, outcome_label: a.outcome_label, lag: `${a.lag_window[0]}–${a.lag_window[1]} hours`, effect_type: a.effect_type,
    n_exposed: a.n_exposed, n_unexposed: a.n_unexposed,
    ...(a.effect_type === 'risk_difference'
      ? { rate_exposed: round(ev.rate_exposed!), rate_unexposed: round(ev.rate_unexposed!), risk_difference: round(a.effect), ci: [round(a.ci_low), round(a.ci_high)] }
      : { mean_exposed: round(ev.mean_exposed!, 1), mean_unexposed: round(ev.mean_unexposed!, 1), difference: round(a.effect, 1) }),
    q: round(a.q_value, 3), adjusted_for: a.adjusted_for, attenuation: a.attenuation === null ? null : round(a.attenuation), warnings: a.warnings.map((w) => w.code), confidence: a.confidence,
  };
}
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

handlers.set('run_analysis', async (tx, deps, payload, userId) => {
  const runId = String(payload.run_id);
  // refresh on its own connection: inside this transaction the matview lock would block the engine's reads
  await deps.db.query('SELECT refresh_derived()');
  let res: { engine_version: string; summary: Record<string, unknown>; associations: EngineAssoc[]; not_enough_data: unknown[] };
  try {
    const r = await fetch(`${deps.env.ANALYSIS_URL}/analyze/associations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: userId }), signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`analysis service ${r.status}`);
    res = await r.json() as typeof res;
  } catch (e) {
    await tx.query(`UPDATE analysis_run SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`, [runId, `The analysis service could not be reached (${(e as Error).message}). Your data is safe; try again later.`]);
    return { failed: true };
  }
  const { rows: prev } = await tx.query<{ id: string; exposure_ref: string; outcome_ref: string; lag: string; outcome_state: string | null }>(
    `SELECT a.id, a.exposure_ref, a.outcome_ref, lower(a.lag_window)::text || '-' || upper(a.lag_window)::text AS lag, a.outcome_state FROM association a
     WHERE a.superseded_by IS NULL AND a.run_id <> $1`, [runId]);
  const prevBy = new Map(prev.map((p) => [`${p.exposure_ref}|${p.outcome_ref}|${p.lag}`, p]));
  let newInsights = 0;
  for (const a of res.associations) {
    const needsModel = a.confidence === 'medium' || a.confidence === 'high';
    const narr = needsModel ? await deps.llm.narrate({ payload: narrativePayload(a) }) : null;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO association (run_id, user_id, exposure_kind, exposure_ref, exposure_label, outcome_ref, outcome_label, lag_window, n_exposed, n_unexposed,
         n_outcome_exposed, n_outcome_unexposed, effect_type, effect, ci_low, ci_high, p_value, q_value, rho_1, attenuation, adjusted_for, confounder_warnings, evidence, confidence, narrative_model, narrative_prompt_version)
       VALUES ($1, app_current_user(), $2, $3, $4, $5, $6, int4range($7, $8), $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING id`,
      [runId, a.exposure_ref.split(':')[0], a.exposure_ref, a.exposure_label, a.outcome_ref, a.outcome_label, Math.round(a.lag_window[0]), Math.round(a.lag_window[1]), a.n_exposed, a.n_unexposed,
        a.n_outcome_exposed, a.n_outcome_unexposed, a.effect_type, a.effect, a.ci_low, a.ci_high, a.p_value, a.q_value, a.rho_1, a.attenuation, a.adjusted_for, JSON.stringify(a.warnings),
        { ...a.evidence, reverse: a.reverse, dose_response: a.dose_response, replication: a.replication, overlapping_events: a.overlapping_events ?? [], adjusted_effect: a.adjusted_effect, standardized: a.standardized },
        a.confidence, narr?.model ?? null, narr?.prompt_version ?? null]);
    const id = rows[0]!.id;
    if (narr) await tx.query('UPDATE association SET narrative = $2 WHERE id = $1', [id, deps.keys.crypto.seal('association', 'narrative', id, JSON.stringify({ en: narr.en, he: narr.he }))]);
    const old = prevBy.get(`${a.exposure_ref}|${a.outcome_ref}|${Math.round(a.lag_window[0])}-${Math.round(a.lag_window[1])}`);
    if (old) await tx.query('UPDATE association SET superseded_by = $2 WHERE id = $1', [old.id, id]);
    if (old?.outcome_state) await tx.query('UPDATE association SET outcome_state = $2 WHERE id = $1', [id, old.outcome_state]);
    if (!old && needsModel) newInsights++;
  }
  // pairs that no longer appear are superseded by nothing: they stop showing, their history stays
  await tx.query(`UPDATE association SET superseded_by = id WHERE superseded_by IS NULL AND run_id <> $1 AND outcome_state IS NULL`, [runId]);
  await tx.query(`UPDATE analysis_run SET status = 'done', finished_at = now(), engine_version = $2, summary = $3, n_days = $4, window_start = $5, window_end = $6 WHERE id = $1`,
    [runId, res.engine_version, { ...res.summary, not_enough_data: res.not_enough_data }, res.summary.n_days_analysed ?? 0, res.summary.window_start ?? null, res.summary.window_end ?? null]);
  await publish(deps, tx, userId!, 'analysis.completed', { run_id: runId, new_insights: newInsights });
  if (newInsights) await tx.query(`INSERT INTO inbox_item (user_id, kind, ref_id, payload) VALUES (app_current_user(), 'insights', $1, $2)`, [runId, { new: newInsights }]);
  return { associations: res.associations.length };
});

/** Nightly-ish: every user whose last run is older than a day gets one queued. */
systemHandlers.set('schedule_analysis', async (deps) => {
  const users = await anonymous(deps.db, async (tx) => (await tx.query<{ user_id: string }>(`SELECT user_id FROM job_users_with_activity(interval '1 day')`)).rows);
  let n = 0;
  for (const u of users) {
    await withUser(deps.db, u.user_id, async (tx) => {
      const { rows } = await tx.query(`SELECT 1 FROM analysis_run WHERE started_at > now() - interval '20 hours'`);
      const { rows: enough } = await tx.query(`SELECT count(DISTINCT local_day)::int AS n FROM observation WHERE deleted_at IS NULL`);
      if (!rows.length && (enough[0] as { n: number }).n >= 21) { await requestRun(tx, { scheduled: true }); n++; }
    });
  }
  return { queued: n };
});

export function assertRunnable(status: string) { if (status === 'failed') throw new HttpProblem(503, 'analysis_failed', 'The last analysis failed'); }
