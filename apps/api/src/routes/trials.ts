import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { localDay } from '@foodtrack/shared';
import { withUser } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { getUser } from '../services/users.js';
import { createTrial, evaluateTrial, finish, getTrialRow, propose, startTrial, trialView, washoutStatus, type Phase } from '../services/trials.js';

const Target = z.object({ kind: z.enum(['food', 'tag', 'nutrient', 'medication']), ref: z.string().min(1).max(100), label: z.object({ en: z.string(), he: z.string() }) });

export async function trialRoutes(app: FastifyInstance) {
  const { deps } = app;
  const P = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.post('/trials/propose', async (req) => {
    const b = z.object({ insight_id: z.string().uuid().optional(), target: Target.optional(), preferred_design: z.enum(['A', 'B', 'C', 'D']).optional(), primary_outcome: z.string().optional() }).parse(req.body);
    return withUser(deps.db, req.userId, (tx) => propose(tx, deps, b as never));
  });
  app.post('/trials', async (req, reply) => {
    const b = z.object({ insight_id: z.string().uuid().optional(), target: Target.optional(), preferred_design: z.enum(['A', 'B', 'C', 'D']).optional(), elimination_days: z.number().int().optional(),
      reuse_baseline: z.boolean().optional(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), primary_outcome: z.string().optional(),
      minimum_interesting_effect: z.number().optional(), min_adherence: z.number().optional(), start: z.boolean().default(true) }).parse(req.body);
    const id = await withUser(deps.db, req.userId, async (tx) => {
      const id = await createTrial(tx, deps, b as never);
      if (b.start && (await getTrialRow(tx, id)).design !== 'D') await startTrial(tx, deps, id);
      return id;
    });
    return reply.status(201).send(await withUser(deps.db, req.userId, async (tx) => trialView(await getTrialRow(tx, id))));
  });
  app.post('/trials/:id/start', async (req) => withUser(deps.db, req.userId, async (tx) => { await startTrial(tx, deps, P(req)); return trialView(await getTrialRow(tx, P(req))); }));
  app.get('/trials', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query('SELECT * FROM trial ORDER BY created_at DESC');
    return { data: rows.map(trialView), total: rows.length };
  }));
  app.get('/trials/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    await evaluateTrial(tx, deps, P(req)).catch((e) => { if (!(e instanceof HttpProblem)) throw e; });
    const t = await getTrialRow(tx, P(req));
    const { rows: days } = await tx.query(`SELECT local_day, phase, period_index, assigned_dose, adherent, exposure_detected, logged, analytic_excluded FROM trial_day WHERE trial_id = $1 ORDER BY local_day`, [P(req)]);
    const user = await getUser(tx);
    const today = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover });
    const blind = t.design === 'D' && !t.revealed_at;
    const { rows: guesses } = await tx.query('SELECT period_index, guess, confidence FROM trial_period_guess WHERE trial_id = $1', [P(req)]);
    const past = days.filter((d: { local_day: string }) => d.local_day < today);
    const abs = past.filter((d: { phase: string; logged: boolean }) => ['elimination', 'washout', 'followup', 'off', 'challenge'].includes(d.phase) && d.logged);
    // no live effect estimate (D21): "Knowing early changes how you rate things."
    return { ...trialView(t), today, days: days.map((d: Record<string, unknown>) => (blind && d.phase === 'challenge' ? { ...d, phase: 'challenge' } : d)),
      adherence_so_far: abs.length ? abs.filter((d: { adherent: boolean | null }) => d.adherent !== false).length / abs.length : null, guesses };
  }));
  app.post('/trials/:id/pause', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const b = z.object({ reason: z.string().max(200).optional() }).parse(req.body ?? {});
    const t = await getTrialRow(tx, P(req)); if (t.status !== 'active') throw new HttpProblem(409, 'not_active', 'Only an active trial can be paused');
    await tx.query(`UPDATE trial SET status = 'paused', deviations = deviations || $2::jsonb WHERE id = $1`, [P(req), JSON.stringify([{ type: 'pause', at: new Date().toISOString(), reason: b.reason ?? null }])]);
    return trialView(await getTrialRow(tx, P(req)));
  }));
  app.post('/trials/:id/resume', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await getTrialRow(tx, P(req)); if (t.status !== 'paused') throw new HttpProblem(409, 'not_paused', 'This trial is not paused');
    const dev = (t.deviations as { type: string; at: string }[]).filter((d) => d.type === 'pause').pop()!;
    const user = await getUser(tx);
    const from = localDay(new Date(dev.at), { timezone: user.timezone, dayRollover: user.day_rollover });
    const today = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover });
    const n = Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86400_000));
    // paused days are excluded, not counted as non-adherent: the remaining schedule moves forward
    if (n > 0) {
      const phases = (t.phases as Phase[]).map((p) => (p.end < from ? p : p.start >= from ? { ...p, start: shift(p.start, n), end: shift(p.end, n) } : { ...p, end: shift(p.end, n) }));
      await tx.query(`UPDATE trial SET phases = $2 WHERE id = $1`, [P(req), JSON.stringify(phases)]);
      await tx.query(`DELETE FROM trial_day WHERE trial_id = $1 AND local_day >= $2`, [P(req), from]);
      for (let d = from; d < today; d = shift(d, 1)) await tx.query(`INSERT INTO trial_day (trial_id, user_id, local_day, phase) VALUES ($1, app_current_user(), $2, 'paused')`, [P(req), d]);
      for (const p of phases) for (let d = p.start; d <= p.end; d = shift(d, 1)) if (d >= today)
        await tx.query(`INSERT INTO trial_day (trial_id, user_id, local_day, phase, period_index, assigned_dose) VALUES ($1, app_current_user(), $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [P(req), d, p.phase, p.period_index ?? null, p.dose ? JSON.stringify(p.dose) : null]);
    }
    await tx.query(`UPDATE trial SET status = 'active', deviations = deviations || $2::jsonb WHERE id = $1`, [P(req), JSON.stringify([{ type: 'resume', at: new Date().toISOString(), days_paused: n }])]);
    return trialView(await getTrialRow(tx, P(req)));
  }));
  app.post('/trials/:id/abandon', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const b = z.object({ reason: z.enum(['too_hard', 'felt_unwell', 'circumstances_changed', 'lost_interest', 'other']), note: z.string().max(500).optional() }).parse(req.body);
    await tx.query(`UPDATE trial SET status = 'abandoned', completed_at = now(), abandon_reason = $2 WHERE id = $1 AND status IN ('proposed','active','paused')`, [P(req), deps.keys.crypto.seal('trial', 'abandon_reason', P(req), JSON.stringify(b))]);
    const t = await getTrialRow(tx, P(req));
    if (t.origin_association_id) await tx.query(`UPDATE association SET outcome_state = NULL WHERE id = $1 AND outcome_state = 'testing'`, [t.origin_association_id]);
    return trialView(t);
  }));
  app.post('/trials/:id/stop-early', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await getTrialRow(tx, P(req)); if (!['active', 'paused'].includes(String(t.status))) throw new HttpProblem(409, 'not_running', 'This trial is not running');
    await finish(tx, deps, P(req), 'stopped_early');
    return trialView(await getTrialRow(tx, P(req)));
  }));
  /** Manual slip / adherence override for a day (08 §9.3). */
  app.post('/trials/:id/days/:date', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { date } = req.params as { date: string };
    const b = z.object({ adherent: z.boolean(), note: z.string().max(500).optional(), extend_days: z.number().int().min(0).max(2).optional() }).parse(req.body);
    const r = await tx.query(`UPDATE trial_day SET adherent = $3, note = $4 WHERE trial_id = $1 AND local_day = $2 RETURNING local_day`, [P(req), date, b.adherent, b.note ? deps.keys.crypto.seal('trial_day', 'note', `${P(req)}:${date}`, b.note) : null]);
    if (!r.rows[0]) throw notFound('trial day');
    if (b.extend_days) {
      const t = await getTrialRow(tx, P(req));
      const phases = (t.phases as Phase[]).map((p) => (p.phase === 'elimination' && p.start <= date && date <= p.end ? { ...p, end: shift(p.end, b.extend_days!) } : p.start > date ? { ...p, start: shift(p.start, b.extend_days!), end: shift(p.end, b.extend_days!) } : p));
      await tx.query(`UPDATE trial SET phases = $2, deviations = deviations || $3::jsonb WHERE id = $1`, [P(req), JSON.stringify(phases), JSON.stringify([{ type: 'extended_for_slip', day: date, days: b.extend_days }])]);
      await tx.query(`DELETE FROM trial_day WHERE trial_id = $1 AND local_day > $2`, [P(req), date]);
      for (const p of phases) for (let d = p.start; d <= p.end; d = shift(d, 1)) if (d > date)
        await tx.query(`INSERT INTO trial_day (trial_id, user_id, local_day, phase, period_index, assigned_dose) VALUES ($1, app_current_user(), $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [P(req), d, p.phase, p.period_index ?? null, p.dose ? JSON.stringify(p.dose) : null]);
    }
    return { ok: true };
  }));
  app.get('/trials/:id/exposures', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT local_day, phase FROM trial_day WHERE trial_id = $1 AND exposure_detected ORDER BY local_day`, [P(req)]);
    return { data: rows, total: rows.length };
  }));
  app.get('/trials/:id/verdict', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await getTrialRow(tx, P(req));
    if (!['completed', 'stopped_early'].includes(String(t.status))) throw new HttpProblem(409, 'not_complete', 'No verdict yet', 'The result is shown at the end. Knowing early changes how you rate things.');
    if (t.design === 'D' && !t.revealed_at) throw new HttpProblem(409, 'not_revealed', 'Reveal the allocation first', 'The verdict of a blinded trial is shown once you reveal which periods were active.');
    return { ...(t.verdict as object), trial_id: t.id, target_label: t.target_label, hypothesis: t.hypothesis };
  }));

  // ───── Design D: sealed allocation (03 §17.1) ─────
  app.post('/trials/:id/allocation', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await getTrialRow(tx, P(req));
    if (t.design !== 'D') throw new HttpProblem(409, 'not_blinded', 'Only blinded trials have an allocation');
    if (t.started_at && !t.allocation_sealed) throw new HttpProblem(409, 'started', 'Already started');
    return { n_periods: 6, sealed: Boolean(t.allocation_sealed), sealed_at: t.sealed_at };
  }));
  app.get('/trials/:id/schedule', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await getTrialRow(tx, P(req));
    // envelope labels and dates only — no arm information
    return { periods: (t.phases as Phase[]).filter((p) => p.phase === 'challenge').map((p) => ({ label: p.label ?? `P${(p.period_index ?? 0) + 1}`, start: p.start, end: p.end, period_index: p.period_index })) };
  }));
  app.post('/trials/:id/reveal', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await getTrialRow(tx, P(req));
    if (t.design !== 'D') throw new HttpProblem(409, 'not_blinded', 'Only blinded trials are revealed');
    if (t.revealed_at) return { revealed_at: t.revealed_at, allocation: JSON.parse(deps.keys.crypto.open('trial', 'allocation', P(req), t.allocation_key as Buffer)!), already: true };
    if (!['completed', 'stopped_early', 'abandoned'].includes(String(t.status))) throw new HttpProblem(409, 'not_complete', 'Finish the trial first', 'Revealing early would end the blinding for the periods still to come.');
    await tx.query(`UPDATE trial SET revealed_at = now() WHERE id = $1`, [P(req)]);
    await tx.query(`INSERT INTO security_audit (user_id, action, detail, ip) VALUES (app_current_user(), 'trial_revealed', $1, $2)`, [{ trial_id: P(req) }, req.ip]);
    return { revealed_at: new Date().toISOString(), allocation: JSON.parse(deps.keys.crypto.open('trial', 'allocation', P(req), t.allocation_key as Buffer)!) };
  }));
  app.post('/trials/:id/periods/:index/guess', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const idx = Number((req.params as { index: string }).index);
    const b = z.object({ guess: z.enum(['active', 'control', 'no_idea']), confidence: z.number().int().min(1).max(5).optional() }).parse(req.body);
    const t = await getTrialRow(tx, P(req));
    if (t.revealed_at) throw new HttpProblem(409, 'revealed', 'Too late', 'A guess after the reveal is worthless, so it isn’t recorded.');
    const user = await getUser(tx);
    const today = localDay(new Date(), { timezone: user.timezone, dayRollover: user.day_rollover });
    const period = (t.phases as Phase[]).filter((p) => p.period_index === idx && ['challenge', 'on', 'off', 'habitual', 'half', 'quarter'].includes(p.phase)).pop();
    if (!period) throw notFound('period');
    if (period.end >= today) throw new HttpProblem(409, 'period_running', 'Answer once this period is over');
    await tx.query(`INSERT INTO trial_period_guess (trial_id, user_id, period_index, guess, confidence) VALUES ($1, app_current_user(), $2, $3, $4)
      ON CONFLICT (trial_id, period_index) DO UPDATE SET guess = EXCLUDED.guess, confidence = EXCLUDED.confidence, answered_at = now()`, [P(req), idx, b.guess, b.confidence ?? null]);
    return { ok: true };
  }));
  app.get('/trials/:id/blinding-report', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await getTrialRow(tx, P(req));
    if (t.design === 'D' && !t.revealed_at) throw new HttpProblem(409, 'not_revealed', 'Reveal first');
    return (t.verdict as { blinding?: unknown } | null)?.blinding ?? { n_periods_guessed: 0 };
  }));
  app.get('/trials/:id/washout-status', async (req) => withUser(deps.db, req.userId, (tx) => washoutStatus(tx, deps, P(req))));
  app.post('/trials/:id/washout/override', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const b = z.object({ reason: z.string().min(3).max(300) }).parse(req.body);
    await tx.query(`UPDATE trial SET deviations = deviations || $2::jsonb WHERE id = $1`, [P(req), JSON.stringify([{ type: 'washout_override', at: new Date().toISOString(), reason: b.reason }])]);
    return { ok: true, deviation_recorded: true };
  }));

  // ───── avoid list (D17) ─────
  app.get('/avoid', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT id, kind, ref, label, reason, trial_id, added_at FROM avoid_entry WHERE removed_at IS NULL ORDER BY added_at DESC`);
    return { data: rows, total: rows.length };
  }));
  app.post('/avoid', async (req, reply) => {
    const b = z.object({ kind: z.enum(['food', 'tag']), ref: z.string().min(1), label: z.object({ en: z.string(), he: z.string() }), reason: z.enum(['trial_confirmed', 'user_choice']).default('user_choice'), trial_id: z.string().uuid().optional() }).parse(req.body);
    return reply.status(201).send(await withUser(deps.db, req.userId, async (tx) => {
      const n = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM avoid_entry WHERE removed_at IS NULL')).rows[0]!.n;
      if (n >= deps.analysis.max_concurrent_eliminations) throw new HttpProblem(409, 'elimination_cap', 'Already avoiding enough', 'Bring one back before adding another.', undefined, { reason: 'elimination_cap' });
      const { rows } = await tx.query(`INSERT INTO avoid_entry (user_id, kind, ref, label, reason, trial_id) VALUES (app_current_user(), $1, $2, $3, $4, $5)
        ON CONFLICT (user_id, kind, ref) WHERE removed_at IS NULL DO UPDATE SET reason = EXCLUDED.reason RETURNING id`, [b.kind, b.ref, b.label, b.reason, b.trial_id ?? null]);
      return rows[0];
    }));
  });
  app.delete('/avoid/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    await tx.query('UPDATE avoid_entry SET removed_at = now() WHERE id = $1', [P(req)]);
    return { ok: true };
  }));
}

function shift(d: string, n: number) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
