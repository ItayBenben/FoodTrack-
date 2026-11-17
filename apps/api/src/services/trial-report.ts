/**
 * The trial report (D44, S137, 03 §17.8): a CENT/SCRIBE-style account of one finished N-of-1 trial, for the
 * user to hand to a clinician. Built from the FROZEN pre-registration on the trial row (never from current
 * config defaults) plus what actually happened: the schedule as run, the sequence completed, every day's raw
 * data, protocol deviations, adverse events and the verdict as it was computed.
 *
 * Rendering is the browser's (print to PDF), like the clinician report (I-24, I-31).
 */
import { localDay } from '@foodtrack/shared';
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';
import { getUser } from './users.js';
import { getTrialRow, type Phase } from './trials.js';

const FINISHED = new Set(['completed', 'stopped_early', 'abandoned']);

interface DayRow { local_day: string; phase: string; period_index: number | null; assigned_dose: string | null; adherent: boolean | null; exposure_detected: boolean;
  outcome_value: string | number | null; logged: boolean; analytic_excluded: boolean }

export async function trialReport(tx: Tx, deps: Deps, id: string) {
  const t = await getTrialRow(tx, id); // 404 for another user's trial: RLS hides the row
  if (!FINISHED.has(String(t.status))) throw new HttpProblem(409, 'not_complete', 'No report yet', 'The report covers a finished trial. Knowing early changes how you rate things.');
  if (t.design === 'D' && !t.revealed_at) throw new HttpProblem(409, 'not_revealed', 'Reveal the allocation first', 'The report names which periods were active, so it waits for the reveal.');

  const user = await getUser(tx);
  const rollover = { timezone: user.timezone, dayRollover: user.day_rollover };
  // the same cut-off the verdict used: days before the day the trial ended
  const endDay = t.completed_at ? localDay(new Date(String(t.completed_at)), rollover) : localDay(new Date(), rollover);
  const allocation: string[] | null = t.design === 'D' && t.allocation_key
    ? JSON.parse(deps.keys.crypto.open('trial', 'allocation', id, t.allocation_key as Buffer)!) as string[] : null;
  const armOf = (phase: string, idx: number | null | undefined) => (allocation && phase === 'challenge' && idx !== null && idx !== undefined ? allocation[idx] ?? null : null);

  const { rows } = await tx.query<DayRow>(`SELECT local_day::text, phase, period_index, assigned_dose, adherent, exposure_detected, outcome_value, logged, analytic_excluded
    FROM trial_day WHERE trial_id = $1 AND local_day < $2 ORDER BY local_day`, [id, endDay]);
  const days = rows.map((d) => ({ day: d.local_day, phase: d.phase, period_index: d.period_index, arm: armOf(d.phase, d.period_index), assigned_dose: d.assigned_dose,
    outcome: d.outcome_value === null ? null : Number(d.outcome_value), logged: d.logged, adherent: d.adherent, exposure_detected: d.exposure_detected, analytic_excluded: d.analytic_excluded }));

  // the sequence actually completed: consecutive runs of the same phase/period
  const sequence: { phase: string; period_index: number | null; arm: string | null; start: string; end: string; n_days: number; n_logged: number; n_adherent: number; n_non_adherent: number; n_excluded: number }[] = [];
  for (const d of days) {
    const last = sequence[sequence.length - 1];
    if (last && last.phase === d.phase && last.period_index === d.period_index) { last.end = d.day; last.n_days++; tally(last, d); continue; }
    const run = { phase: d.phase, period_index: d.period_index, arm: d.arm, start: d.day, end: d.day, n_days: 1, n_logged: 0, n_adherent: 0, n_non_adherent: 0, n_excluded: 0 };
    tally(run, d); sequence.push(run);
  }

  const startedAt = t.started_at ? new Date(String(t.started_at)) : null;
  const endedAt = t.completed_at ? new Date(String(t.completed_at)) : new Date();
  const adverse = startedAt
    ? (await tx.query<{ rule_key: string; raised_at: Date; acknowledged_at: Date | null }>(
      'SELECT rule_key, raised_at, acknowledged_at FROM safety_flag WHERE raised_at >= $1 AND raised_at <= $2 ORDER BY raised_at', [startedAt, endedAt])).rows
    : [];

  const hyp = t.hypothesis as Record<string, unknown>;
  const abandonReason = t.abandon_reason ? safeJson(deps.keys.crypto.open('trial', 'abandon_reason', id, t.abandon_reason as Buffer)) : null;
  return {
    generated_at: new Date().toISOString(),
    trial: { id: t.id, design: t.design, open_label: t.design !== 'D', status: t.status, target_label: t.target_label, primary_outcome: t.primary_outcome,
      created_at: t.created_at, started_at: t.started_at, completed_at: t.completed_at, sealed_at: t.sealed_at ?? null, revealed_at: t.revealed_at ?? null,
      retest_of: t.retest_of ?? null, baseline: t.baseline_start ? { start: t.baseline_start, end: t.baseline_end } : null },
    // exactly as frozen at creation (a DB trigger forbids edits); `power` is null for trials created before it was recorded
    preregistration: { ...hyp, power: hyp.power ?? null },
    schedule: (t.phases as Phase[]).map((p) => ({ phase: p.phase, start: p.start, end: p.end, period_index: p.period_index ?? null, label: p.label ?? null, dose: p.dose ?? null, arm: armOf(p.phase, p.period_index) })),
    sequence,
    days,
    washout: { days_actual: t.washout_days_actual ?? null, gate_delta: t.washout_gate_delta === null || t.washout_gate_delta === undefined ? null : Number(t.washout_gate_delta), analytic_k: t.analytic_washout_k },
    deviations: [...(t.deviations as unknown[]), ...(t.status === 'abandoned' ? [{ type: 'abandoned', at: t.completed_at, reason: abandonReason }] : [])],
    adverse_events: adverse.map((a) => ({ rule_key: a.rule_key, raised_at: a.raised_at, acknowledged_at: a.acknowledged_at })),
    verdict: t.verdict ?? null,
  };
}

function tally(run: { n_logged: number; n_adherent: number; n_non_adherent: number; n_excluded: number }, d: { logged: boolean; adherent: boolean | null; analytic_excluded: boolean }) {
  if (d.logged) run.n_logged++;
  if (d.adherent === true) run.n_adherent++;
  if (d.adherent === false) run.n_non_adherent++;
  if (d.analytic_excluded) run.n_excluded++;
}

function safeJson(s: string | null): unknown { if (!s) return null; try { return JSON.parse(s); } catch { return s; } }
