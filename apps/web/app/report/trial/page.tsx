'use client';
/** S137 — the N-of-1 trial report (D44). Built from the frozen pre-registration and the observed days; printed to
 *  PDF by the browser, like the clinician report (I-24, I-31). Numbers and records only — no generated narrative. */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui';

interface Run { phase: string; period_index: number | null; arm: string | null; start: string; end: string; n_days: number; n_logged: number; n_adherent: number; n_non_adherent: number; n_excluded: number }
interface Day { day: string; phase: string; period_index: number | null; arm: string | null; outcome: number | null; logged: boolean; adherent: boolean | null; exposure_detected: boolean; analytic_excluded: boolean }
interface Deviation { type: string; at?: string; day?: string; days?: number; days_paused?: number; reason?: unknown }
interface Verdict { verdict: string; effect: number | null; ci: [number, number] | null; p_effect: number | null; p_rope: number | null; n_on: number; n_off: number; adherence: number; days_logged_share: number;
  limitations?: string[]; partial?: boolean; stopped_on_day?: number; of_days?: number; downgraded_by_guess?: boolean;
  blinding?: { break_blind_rate: number | null; chance_baseline: number; effect_by_guess: number | null; effect_by_allocation: number; diverges: boolean } | null }
interface Report {
  generated_at: string;
  trial: { design: 'A' | 'B' | 'C' | 'D'; open_label: boolean; status: string; target_label: { en: string; he: string }; primary_outcome: string; started_at: string | null; completed_at: string | null; retest_of: string | null; baseline: { start: string; end: string } | null };
  preregistration: { prespecified_at?: string; outcome_type?: string; minimum_interesting_effect?: number; decision_bar?: number; min_adherence?: number; min_days_logged?: number; analysis?: string; analytic_washout_k?: number; baseline_reused?: boolean; power: { power: number; adequate: boolean } | null };
  schedule: { phase: string; start: string; end: string; period_index: number | null; label: string | null; arm: string | null }[];
  sequence: Run[]; days: Day[]; deviations: Deviation[]; adverse_events: { rule_key: string; raised_at: string }[]; verdict: Verdict | null;
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : String(Math.round(x * 100)));

export default function TrialReport() {
  const { t, label, fmtDay, num } = useI18n(); const { phase } = useSession();
  const [r, setR] = useState<Report | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== 'ready') return;
    const id = new URLSearchParams(location.search).get('id');
    void api<Report>(`/trials/${id}/report`).then(setR).catch((e) => setErr(e instanceof ApiError && e.status === 409 ? t('trial_report.not_ready') : (e as Error).message));
  }, [phase, t]);
  const day = (d: string | null | undefined) => (d ? fmtDay(d.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
  const yn = (b: boolean | null) => (b === null ? '—' : b ? t('trial_report.yes') : t('trial_report.no'));
  const phaseName = (p: string, arm: string | null) => (arm ? `${t(`trial.phase.${p}`)} · ${t(`trial.phase.${arm}`)}` : t(`trial.phase.${p}`));
  const devText = (d: Deviation) => {
    const date = day(d.day ?? d.at);
    const reason = typeof d.reason === 'object' && d.reason && 'reason' in d.reason ? t(`trial.abandon_reason.${String((d.reason as { reason: string }).reason)}`) : d.reason ? String(d.reason) : '—';
    if (['pause', 'resume', 'extended_for_slip', 'washout_override', 'abandoned'].includes(d.type)) return t(`trial_report.deviation.${d.type}`, { date, n: d.days ?? d.days_paused ?? 0, reason });
    return t('trial_report.deviation.other', { type: d.type, date });
  };

  if (err) return <main className="max-w-3xl mx-auto p-6"><p>{err}</p><Button variant="ghost" className="mt-3" onClick={() => history.back()}>{t('common.back')}</Button></main>;
  if (!r) return null;
  const pr = r.preregistration; const v = r.verdict; const name = label(r.trial.target_label);
  return (
    <main className="max-w-3xl mx-auto p-6 bg-surface text-text print:p-0" data-testid="trial-report">
      <div className="print:hidden mb-4 flex gap-2"><Button onClick={() => window.print()}>{t('trial_report.print')}</Button><Button variant="ghost" onClick={() => history.back()}>{t('common.back')}</Button></div>
      <h1 className="text-title font-bold">{t('trial_report.title')}</h1>
      <p className="font-semibold" dir="auto">{t('trial_report.subtitle', { name, design: t(`trial.design_name.${r.trial.design}`) })}</p>
      {r.trial.open_label && <p className="text-label">{t('trial.open_label')}</p>}
      <p className="text-label">{t('trial_report.dates', { start: day(r.trial.started_at), end: day(r.trial.completed_at) })} · {t('trial_report.status', { status: t(`trial.status.${r.trial.status}`) })}</p>
      <p className="text-label text-text-muted">{t('trial_report.generated', { date: day(r.generated_at) })}</p>

      <h2 className="font-semibold mt-4">{t('trial_report.prereg_title')}</h2>
      <p className="text-label text-text-muted">{t('trial_report.prereg_note')}</p>
      <ul className="text-label mt-1">
        {pr.prespecified_at && <li>{t('trial_report.prespecified', { date: day(pr.prespecified_at) })}</li>}
        <li>{t('trial_report.primary_outcome', { outcome: r.trial.primary_outcome, type: t(`trial_report.outcome_type.${pr.outcome_type ?? 'binary'}`) })}</li>
        {pr.minimum_interesting_effect !== undefined && <li>{t('trial_report.mie', { v: num(pr.minimum_interesting_effect, 2) })}</li>}
        {pr.decision_bar !== undefined && <li>{t('trial_report.decision_bar', { p: pct(pr.decision_bar) })}</li>}
        {pr.min_adherence !== undefined && <li>{t('trial_report.min_adherence', { p: pct(pr.min_adherence) })}</li>}
        {pr.min_days_logged !== undefined && <li>{t('trial_report.min_days_logged', { p: pct(pr.min_days_logged) })}</li>}
        {pr.analysis && <li>{t('trial_report.analysis', { method: t(`trial_report.method.${pr.analysis}`) })}</li>}
        <li>{pr.power ? t('trial_report.power', { p: pct(pr.power.power), adequate: t(pr.power.adequate ? 'trial_report.power_adequate' : 'trial_report.power_inadequate') }) : t('trial_report.power_missing')}</li>
        {pr.baseline_reused && r.trial.baseline && <li>{t('trial_report.baseline_reused', { start: day(r.trial.baseline.start), end: day(r.trial.baseline.end) })}</li>}
        {pr.analytic_washout_k !== undefined && <li>{t('trial_report.washout_k', { n: pr.analytic_washout_k })}</li>}
        {r.trial.retest_of && <li>{t('trial_report.retest_of')}</li>}
      </ul>

      <h2 className="font-semibold mt-4">{t('trial_report.schedule_title')}</h2>
      <table className="w-full text-label"><thead><tr><th className="text-start">{t('trial_report.col.phase')}</th><th className="text-start">{t('trial_report.col.period')}</th><th className="text-start">{t('trial_report.col.dates')}</th></tr></thead>
        <tbody>{r.schedule.map((p, i) => <tr key={i}><td>{phaseName(p.phase, p.arm)}</td><td>{p.label ?? (p.period_index !== null ? p.period_index + 1 : '')}</td><td className="tabular-nums">{day(p.start)} – {day(p.end)}</td></tr>)}</tbody></table>

      <h2 className="font-semibold mt-4">{t('trial_report.sequence_title')}</h2>
      {r.sequence.length ? (
        <table className="w-full text-label"><thead><tr><th className="text-start">{t('trial_report.col.phase')}</th><th className="text-start">{t('trial_report.col.dates')}</th><th className="text-end">{t('trial_report.col.days')}</th><th className="text-end">{t('trial_report.col.logged')}</th><th className="text-end">{t('trial_report.col.followed')}</th><th className="text-end">{t('trial_report.col.slipped')}</th><th className="text-end">{t('trial_report.col.excluded')}</th></tr></thead>
          <tbody>{r.sequence.map((s, i) => <tr key={i}><td>{phaseName(s.phase, s.arm)}</td><td className="tabular-nums">{day(s.start)} – {day(s.end)}</td><td className="text-end tabular-nums">{s.n_days}</td><td className="text-end tabular-nums">{s.n_logged}</td><td className="text-end tabular-nums">{s.n_adherent}</td><td className="text-end tabular-nums">{s.n_non_adherent}</td><td className="text-end tabular-nums">{s.n_excluded}</td></tr>)}</tbody></table>
      ) : <p className="text-label">{t('trial_report.sequence_none')}</p>}

      <h2 className="font-semibold mt-4">{t('trial_report.deviations_title')}</h2>
      {r.deviations.length ? <ul className="text-label" dir="auto">{r.deviations.map((d, i) => <li key={i}>{devText(d)}</li>)}</ul> : <p className="text-label">{t('trial_report.deviations_none')}</p>}

      <h2 className="font-semibold mt-4">{t('trial_report.adverse_title')}</h2>
      {r.adverse_events.length ? <ul className="text-label">{r.adverse_events.map((a, i) => <li key={i}>{day(a.raised_at)} · {t(`safety.${a.rule_key}.title`)}</li>)}</ul> : <p className="text-label">{t('trial_report.adverse_none')}</p>}

      <h2 className="font-semibold mt-4">{t('trial_report.verdict_title')}</h2>
      {v ? <>
        <p className="font-semibold">{t(`trial.verdict.${v.verdict}`)}</p>
        {v.effect !== null && v.ci && <p className="text-label">{t('trial_report.numbers', { effect: num(v.effect, 2), lo: num(v.ci[0], 2), hi: num(v.ci[1], 2), p: pct(v.p_effect), rope: pct(v.p_rope) })}</p>}
        <p className="text-label">{t('trial_report.counts', { on: v.n_on, off: v.n_off, adh: pct(v.adherence), logged: pct(v.days_logged_share) })}</p>
        {v.blinding && <>
          <h3 className="font-semibold mt-2 text-label">{t('trial_report.blinding_title')}</h3>
          {v.blinding.break_blind_rate !== null && <p className="text-label">{t('trial_report.blinding_rate', { p: pct(v.blinding.break_blind_rate), c: pct(v.blinding.chance_baseline) })}</p>}
          {v.blinding.effect_by_guess !== null && <p className="text-label">{t('trial_report.blinding_effect', { g: num(v.blinding.effect_by_guess, 2), a: num(v.blinding.effect_by_allocation, 2) })}</p>}
          {v.downgraded_by_guess && <p className="text-label">{t('trial_report.blinding_diverges')}</p>}
        </>}
        {v.limitations?.length ? <><h3 className="font-semibold mt-2 text-label">{t('trial.limitations_title')}</h3>
          <ul className="text-label">{v.limitations.map((l) => <li key={l}>{t(`trial.limitation.${l}`, { n: v.stopped_on_day ?? 0, of: v.of_days ?? 0 })}</li>)}</ul></> : null}
      </> : <p className="text-label">{t('trial_report.verdict_none')}</p>}

      <h2 className="font-semibold mt-6 break-before-page">{t('trial_report.days_title')}</h2>
      <table className="w-full text-label"><thead><tr><th className="text-start">{t('trial_report.col.day')}</th><th className="text-start">{t('trial_report.col.phase')}</th><th className="text-end">{t('trial_report.col.outcome')}</th><th className="text-end">{t('trial_report.col.logged')}</th><th className="text-end">{t('trial_report.col.followed')}</th><th className="text-end">{t('trial_report.col.exposure')}</th><th className="text-end">{t('trial_report.col.excluded')}</th></tr></thead>
        <tbody>{r.days.map((d) => <tr key={d.day}><td className="tabular-nums">{day(d.day)}</td><td>{phaseName(d.phase, d.arm)}</td><td className="text-end tabular-nums">{d.outcome === null ? '—' : num(d.outcome, 2)}</td><td className="text-end">{yn(d.logged)}</td><td className="text-end">{yn(d.adherent)}</td><td className="text-end">{yn(d.exposure_detected)}</td><td className="text-end">{yn(d.analytic_excluded)}</td></tr>)}</tbody></table>
      <p className="text-label text-text-muted mt-6">{t('trial_report.footer')}</p>
    </main>
  );
}
