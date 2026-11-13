import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withUser, type Tx } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { narrativePayload, requestRun } from '../services/analysis.js';
import type { Deps } from '../app.js';

interface Row {
  id: string; run_id: string; exposure_kind: string; exposure_ref: string; exposure_label: { en: string; he: string }; outcome_ref: string; outcome_label: { en: string; he: string };
  lo: number; hi: number; n_exposed: number; n_unexposed: number; n_outcome_exposed: number; n_outcome_unexposed: number; effect_type: string; effect: number; ci_low: number; ci_high: number;
  p_value: number; q_value: number; rho_1: number; attenuation: number | null; adjusted_for: string[]; confounder_warnings: { code: string; detail?: unknown }[]; evidence: Record<string, unknown>;
  confidence: string; narrative: Buffer | null; narrative_model: string | null; dismissed_at: Date | null; seen_at: Date | null; outcome_state: string | null;
}
const COLS = `id, run_id, exposure_kind, exposure_ref, exposure_label, outcome_ref, outcome_label, lower(lag_window) AS lo, upper(lag_window) AS hi, n_exposed, n_unexposed,
  n_outcome_exposed, n_outcome_unexposed, effect_type, effect, ci_low, ci_high, p_value, q_value, rho_1, attenuation, adjusted_for, confounder_warnings, evidence, confidence,
  narrative, narrative_model, dismissed_at, seen_at, outcome_state`;

function card(deps: Deps, r: Row, full = false) {
  const ev = r.evidence as Record<string, unknown>;
  const narrative = r.narrative ? JSON.parse(deps.keys.crypto.open('association', 'narrative', r.id, r.narrative)!) : null;
  const { days, ...rest } = ev as { days?: unknown[] };
  return {
    id: r.id, run_id: r.run_id,
    exposure: { kind: r.exposure_kind, ref: r.exposure_ref, label: r.exposure_label }, outcome: { ref: r.outcome_ref, label: r.outcome_label },
    lag_window_hours: [r.lo, r.hi],
    evidence: { n_exposed_days: r.n_exposed, n_unexposed_days: r.n_unexposed, n_outcome_exposed: r.n_outcome_exposed, n_outcome_unexposed: r.n_outcome_unexposed,
      effect_type: r.effect_type, effect: r.effect, ci: [r.ci_low, r.ci_high], p_value: r.p_value, q_value: r.q_value, rho_1: r.rho_1, attenuation: r.attenuation,
      adjusted_for: r.adjusted_for, warnings: r.confounder_warnings, ...rest },
    confidence: r.confidence, narrative, narrative_model: r.narrative_model, outcome_state: r.outcome_state, seen: Boolean(r.seen_at),
    actions: r.confidence === 'medium' || r.confidence === 'high' ? [{ type: 'start_trial' }] : [],
    ...(full ? { days: days ?? [] } : {}),
  };
}

async function latest(tx: Tx) {
  const { rows } = await tx.query<{ id: string; status: string; started_at: Date; finished_at: Date | null; summary: Record<string, unknown>; error: string | null; n_days: number | null }>(
    `SELECT id, status, started_at, finished_at, summary, error, n_days FROM analysis_run ORDER BY started_at DESC LIMIT 1`);
  const { rows: done } = await tx.query<{ id: string }>(`SELECT id FROM analysis_run WHERE status = 'done' ORDER BY started_at DESC LIMIT 1`);
  return { last: rows[0] ?? null, lastDone: done[0]?.id ?? null };
}

export async function insightRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.post('/analysis/run', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const r = await withUser(deps.db, req.userId, (tx) => requestRun(tx, (req.body as Record<string, unknown>) ?? {}));
    return reply.status(r.in_flight ? 200 : 202).send(r);
  });
  app.get('/analysis/runs/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query('SELECT id, status, started_at, finished_at, engine_version, n_days, summary, error FROM analysis_run WHERE id = $1', [(req.params as { id: string }).id]);
    if (!rows[0]) throw notFound('analysis run');
    return rows[0];
  }));

  /** The Insights screen's one call: sections, honest empty states, and "N more days". */
  app.get('/insights', async (req) => {
    const q = z.object({ confidence: z.string().optional(), outcome: z.string().optional() }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const { last, lastDone } = await latest(tx);
      const { rows: span } = await tx.query<{ n: number }>(`SELECT count(DISTINCT local_day)::int AS n FROM observation WHERE deleted_at IS NULL`);
      const { rows: active } = await tx.query(`SELECT count(*)::int AS n FROM safety_flag WHERE acknowledged_at IS NULL`);
      if (!lastDone) return { state: span[0]!.n < deps.analysis.min_total_days ? 'not_enough_days' : 'never_run', days_logged: span[0]!.n, days_needed: deps.analysis.min_total_days, last_run: last, sections: null, red_flag_active: (active[0] as { n: number }).n > 0 };
      const { rows } = await tx.query<Row>(`SELECT ${COLS} FROM association WHERE run_id = $1 AND confidence <> 'none' ORDER BY confidence, abs(effect) DESC`, [lastDone]);
      const { rows: dis } = await tx.query<{ exposure_ref: string; outcome_ref: string; effect_at_dismissal: number }>('SELECT exposure_ref, outcome_ref, effect_at_dismissal FROM insight_dismissal');
      const dmap = new Map(dis.map((d) => [`${d.exposure_ref}|${d.outcome_ref}`, d.effect_at_dismissal]));
      // a dismissal holds until the effect moves by more than 10 pp, then the insight resurfaces (D20)
      const visible = rows.filter((r) => { const d = dmap.get(`${r.exposure_ref}|${r.outcome_ref}`); return d === undefined || Math.abs(r.effect - d) > deps.analysis.dismissal_reopen_delta; });
      // One card per exposure (its strongest outcome); nested exposures that cover the same days
      // (food ⊂ tag: "Dairy" and "Dairy (lactose)") fold into it rather than counting as separate discoveries (§7).
      const conf = q.confidence?.split(',');
      const daySet = (r: Row) => new Set(((r.evidence.days as { day: string; exposed: boolean }[] | undefined) ?? []).filter((d) => d.exposed).map((d) => d.day));
      const cards: (ReturnType<typeof card> & { also_outcomes: { ref: string; label: unknown; confidence: string }[]; also_as: unknown[] })[] = [];
      const sets: Set<string>[] = [];
      for (const r of visible) {
        if (conf && !conf.includes(r.confidence)) continue;
        if (q.outcome && r.outcome_ref !== q.outcome) continue;
        const existing = cards.findIndex((c) => c.exposure.ref === r.exposure_ref);
        if (existing >= 0) {
          const c = cards[existing]!;
          if (!c.also_outcomes.some((o) => o.ref === r.outcome_ref) && c.outcome.ref !== r.outcome_ref) c.also_outcomes.push({ ref: r.outcome_ref, label: r.outcome_label, confidence: r.confidence });
          continue;
        }
        const ds = daySet(r);
        const twin = sets.findIndex((s2) => { let inter = 0; for (const d of ds) if (s2.has(d)) inter++; return inter / Math.max(1, ds.size + s2.size - inter) >= 0.9; });
        if (twin >= 0) { const c = cards[twin]!; if (!c.also_as.some((a) => (a as { ref: string }).ref === r.exposure_ref)) c.also_as.push({ ref: r.exposure_ref, label: r.exposure_label }); continue; }
        cards.push({ ...card(deps, r), also_outcomes: [], also_as: [] }); sets.push(ds);
      }
      const { rows: ruled } = await tx.query<Row>(`SELECT ${COLS} FROM association WHERE outcome_state IN ('ruled_out','confirmed') AND superseded_by IS NULL`);
      const summary = last?.id === lastDone ? last!.summary : (await tx.query<{ summary: Record<string, unknown> }>('SELECT summary FROM analysis_run WHERE id = $1', [lastDone])).rows[0]!.summary;
      return {
        state: 'ready', last_run: last, summary, red_flag_active: (active[0] as { n: number }).n > 0,
        sections: {
          worth_testing: cards.filter((c) => c.confidence === 'medium' || c.confidence === 'high'),
          early_signals: cards.filter((c) => c.confidence === 'low'),
          ruled_out: ruled.filter((r) => r.outcome_state === 'ruled_out').map((r) => card(deps, r)),
          confirmed: ruled.filter((r) => r.outcome_state === 'confirmed').map((r) => card(deps, r)),
          not_enough_data: (summary.not_enough_data as unknown[] | undefined) ?? [],
        },
        total: cards.length,
      };
    });
  });
  app.get('/insights/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<Row>(`SELECT ${COLS} FROM association WHERE id = $1`, [(req.params as { id: string }).id]);
    if (!rows[0]) throw notFound('insight');
    await tx.query('UPDATE association SET seen_at = coalesce(seen_at, now()) WHERE id = $1', [rows[0].id]);
    return card(deps, rows[0], true);
  }));
  app.get('/insights/:id/days', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ evidence: { days?: { day: string; exposed: boolean; outcome: number; weight: number }[] } }>(`SELECT evidence FROM association WHERE id = $1`, [(req.params as { id: string }).id]);
    if (!rows[0]) throw notFound('insight');
    const days = rows[0].evidence.days ?? [];
    return { exposed: days.filter((d) => d.exposed), unexposed: days.filter((d) => !d.exposed), total: days.length };
  }));
  app.post('/insights/:id/dismiss', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ exposure_ref: string; outcome_ref: string; effect: number }>('UPDATE association SET dismissed_at = now() WHERE id = $1 RETURNING exposure_ref, outcome_ref, effect', [(req.params as { id: string }).id]);
    if (!rows[0]) throw notFound('insight');
    await tx.query(`INSERT INTO insight_dismissal (user_id, exposure_ref, outcome_ref, effect_at_dismissal) VALUES (app_current_user(), $1, $2, $3)
      ON CONFLICT (user_id, exposure_ref, outcome_ref) DO UPDATE SET effect_at_dismissal = EXCLUDED.effect_at_dismissal, dismissed_at = now()`, [rows[0].exposure_ref, rows[0].outcome_ref, rows[0].effect]);
    return { ok: true, kept_in_data: true };
  }));
  app.post('/insights/:id/undismiss', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ exposure_ref: string; outcome_ref: string }>('UPDATE association SET dismissed_at = NULL WHERE id = $1 RETURNING exposure_ref, outcome_ref', [(req.params as { id: string }).id]);
    if (rows[0]) await tx.query('DELETE FROM insight_dismissal WHERE exposure_ref = $1 AND outcome_ref = $2', [rows[0].exposure_ref, rows[0].outcome_ref]);
    return { ok: true };
  }));
  app.post('/insights/:id/narrative', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<Row>(`SELECT ${COLS} FROM association WHERE id = $1`, [(req.params as { id: string }).id]);
    const r = rows[0]; if (!r) throw notFound('insight');
    const narr = await deps.llm.narrate({ payload: narrativePayload({ ...r, lag_window: [r.lo, r.hi], warnings: r.confounder_warnings, standardized: 0 } as never) });
    await tx.query('UPDATE association SET narrative = $2, narrative_model = $3, narrative_prompt_version = $4 WHERE id = $1', [r.id, deps.keys.crypto.seal('association', 'narrative', r.id, JSON.stringify({ en: narr.en, he: narr.he })), narr.model, narr.prompt_version]);
    return { en: narr.en, he: narr.he, model: narr.model };
  }));
  app.post('/analyze/power', async (req) => {
    const r = await fetch(`${deps.env.ANALYSIS_URL}/analyze/power`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!r?.ok) throw new HttpProblem(503, 'analysis_unavailable', 'The analysis service is not reachable', 'Logging is unaffected. Try again later.');
    return r.json();
  });
}
