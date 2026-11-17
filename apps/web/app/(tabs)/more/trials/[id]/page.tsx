'use client';
/** A trial: live state, slips, guesses, lifecycle, and the verdict card (08 §9, 04 §10.5–10.8). */
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { currentPhase, dayNumber, phaseLength, type Trial, type Verdict } from '@/lib/trials';
import { BackHeader } from '@/components/back';
import { PhaseStrip } from '@/components/trial-card';
import Link from 'next/link';
import { Button, Card, Chip, SectionTitle, Sheet, useToasts } from '@/components/ui';

export default function TrialPage() {
  const { id } = useParams<{ id: string }>();
  const { t, label } = useI18n(); const qc = useQueryClient(); const push = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ['trial', id], queryFn: () => api<Trial>(`/trials/${id}`) });
  const [abandon, setAbandon] = useState(false); const [slip, setSlip] = useState(false); const [slipDay, setSlipDay] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['trial', id] }); void qc.invalidateQueries({ queryKey: ['trials'] }); };
  const act = async (path: string, body?: unknown) => { try { await api(`/trials/${id}/${path}`, { method: 'POST', body: body ?? {} }); refresh(); } catch (e) { push({ text: (e as ApiError).problem?.detail ?? String(e) }); } };
  const tr = q.data; if (!tr) return <BackHeader title={t('more.trials')} />;
  const p = currentPhase(tr); const name = label(tr.target_label);
  const running = tr.status === 'active' || tr.status === 'paused';
  const periods = [...new Set((tr.days ?? []).filter((d) => d.period_index !== null && d.local_day < (tr.today ?? '')).map((d) => d.period_index!))];
  const unanswered = periods.filter((i) => !(tr.guesses ?? []).some((g) => g.period_index === i) && !(tr.days ?? []).some((d) => d.period_index === i && d.local_day >= (tr.today ?? '')));
  return (
    <div><BackHeader title={name} />
      <p className="text-label text-text-muted mt-1">{t(`trial.status.${tr.status}`)} · {t(`trial.design_name.${tr.design}`)}</p>
      {tr.design !== 'D' && <p className="mt-2 text-label px-2 py-1 rounded-chip bg-warn-soft inline-block">{t('trial.open_label')}</p>}
      {tr.status === 'proposed' && tr.design === 'D' && <BlindPrep id={id} onStart={() => void act('start')} />}
      {running && p && (<Card className="mt-3">
        <p className="font-semibold">{tr.status === 'paused' ? t('trial.paused_line') : t(`trial.today.${p.phase}`, { name, dose: p.dose ? label(p.dose) : '' })}</p>
        <p className="text-label text-text-muted">{t('trial.day_of', { n: dayNumber(tr, p), of: phaseLength(p), phase: t(`trial.phase.${p.phase}`) })}</p>
        <PhaseStrip t={tr} />
        {tr.adherence_so_far != null && <p className="text-label mt-1">{t('trial.adherence_so_far', { pct: Math.round(tr.adherence_so_far * 100) })}</p>}
        <p className="text-label text-text-muted mt-1">{t('trial.no_live_estimate')}</p>
      </Card>)}
      {unanswered.length > 0 && !tr.revealed_at && (<Card className="mt-3" data-testid="guess-prompt">
        <p className="font-medium">{t('trial.guess_question')}</p><p className="text-label text-text-muted">{t('trial.guess_why')}</p>
        <div className="flex flex-wrap gap-2 mt-2">{(['active', 'control', 'no_idea'] as const).map((g) => <Chip key={g} onClick={() => void act(`periods/${unanswered[0]}/guess`, { guess: g })}>{t(`trial.guess.${tr.design === 'D' ? 'blind_' : ''}${g}`, { name })}</Chip>)}</div>
      </Card>)}
      {running && (<div className="flex flex-col gap-2 mt-4">
        {['elimination', 'washout', 'followup', 'off'].includes(p?.phase ?? '') && <Button variant="secondary" onClick={() => { setSlipDay(tr.today ?? ''); setSlip(true); }}>{t('trial.i_slipped')}</Button>}
        {tr.status === 'active' ? <Button variant="secondary" onClick={() => void act('pause')}>{t('trial.pause')}</Button> : <Button onClick={() => void act('resume')}>{t('trial.resume')}</Button>}
        <Button variant="secondary" onClick={() => { if (confirm(t('trial.stop_confirm'))) void act('stop-early'); }}>{t('trial.stop_early')}</Button>
        <Button variant="ghost" className="text-danger" onClick={() => setAbandon(true)}>{t('trial.abandon')}</Button>
      </div>)}
      {tr.design === 'D' && !tr.revealed_at && ['completed', 'stopped_early', 'abandoned'].includes(tr.status) && <Button className="w-full mt-4" onClick={() => void act('reveal')} data-testid="reveal">{t('trial.reveal')}</Button>}
      {tr.verdict && <VerdictCard v={tr.verdict} name={name} trial={tr} />}
      {['completed', 'stopped_early', 'abandoned'].includes(tr.status) && (tr.design !== 'D' || tr.revealed_at) && (
        <Link className="mt-3 w-full inline-flex min-h-12 items-center justify-center px-4 rounded-chip border border-border" href={`/report/trial?id=${id}`} data-testid="trial-report-link">{t('trial_report.open')}</Link>)}
      <Sheet open={slip} onClose={() => setSlip(false)} title={t('trial.i_slipped')}>
        <input type="date" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-3" value={slipDay} max={tr.today} onChange={(e) => setSlipDay(e.target.value)} aria-label={t('builder.date')} />
        <Button className="w-full mt-3" onClick={async () => { await act(`days/${slipDay}`, { adherent: false }); setSlip(false); }}>{t('trial.record_slip')}</Button>
        <Button variant="secondary" className="w-full mt-2" onClick={async () => { await act(`days/${slipDay}`, { adherent: false, extend_days: 2 }); setSlip(false); }}>{t('trial.slip_extend')}</Button>
      </Sheet>
      <Sheet open={abandon} onClose={() => setAbandon(false)} title={t('trial.abandon')}>
        <p className="text-text-muted">{t('trial.abandon_why')}</p>
        <div className="flex flex-col gap-2 mt-3">{['too_hard', 'felt_unwell', 'circumstances_changed', 'lost_interest', 'other'].map((r) => <Button key={r} variant="secondary" onClick={async () => { await act('abandon', { reason: r }); setAbandon(false); }}>{t(`trial.abandon_reason.${r}`)}</Button>)}</div>
      </Sheet>
      {tr.verdict && (tr.verdict.verdict === 'effect' || tr.verdict.verdict === 'probable') && (
        <Button variant="secondary" className="w-full mt-3" onClick={async () => { try { await api('/avoid', { method: 'POST', body: { kind: tr.target_kind === 'food' ? 'food' : 'tag', ref: tr.target_ref, label: tr.target_label, reason: 'trial_confirmed', trial_id: tr.id } }); push({ text: t('trial.added_avoid') }); } catch (e) { push({ text: (e as ApiError).problem?.detail ?? String(e) }); } }}>{t('trial.add_avoid')}</Button>)}
    </div>
  );
}

function VerdictCard({ v, name, trial }: { v: Verdict; name: string; trial: Trial }) {
  const { t } = useI18n();
  const binary = v.outcome_type === 'binary';
  const fmt = (x: number) => (binary ? `${Math.round(x * 100)} pp` : x.toFixed(1));
  return (
    <Card className="mt-4" data-testid="verdict">
      <p className="text-title font-semibold">{t(`trial.verdict.${v.verdict}`)}</p>
      <p className="mt-1">{t(`trial.verdict_body.${v.verdict}`, { name })}</p>
      {v.reason && <p className="mt-1 text-label">{t(`trial.verdict_reason.${v.reason}`)}</p>}
      {v.partial && <p className="mt-1 text-label">{t('trial.stopped_line', { n: v.stopped_on_day ?? 0, of: v.of_days ?? 0 })}</p>}
      {v.effect !== null && v.ci && <p className="mt-2 text-label">{t('trial.verdict_numbers', { effect: fmt(v.effect), lo: fmt(v.ci[0]), hi: fmt(v.ci[1]), p: Math.round((v.p_effect ?? 0) * 100) })}</p>}
      <p className="text-label">{t('trial.adherence_line', { a: Math.round(v.adherence * 100), l: Math.round(v.days_logged_share * 100) })}</p>
      {v.blinding && <p className="text-label mt-1">{t('trial.blinding_line', { rate: v.blinding.break_blind_rate === null ? '—' : `${Math.round(v.blinding.break_blind_rate * 100)}%`, chance: Math.round(v.blinding.chance_baseline * 100) })}{v.blinding.diverges ? ` ${t('trial.blinding_diverges')}` : ''}</p>}
      {v.open_label && <p className="mt-2 text-label px-2 py-1 rounded-chip bg-warn-soft inline-block">{t('trial.open_label')}</p>}
      <SectionTitle>{t('trial.limitations_title')}</SectionTitle>
      <ul className="text-label list-disc ps-5">{v.limitations.map((l) => <li key={l}>{t(`trial.limitation.${l}`, { n: v.stopped_on_day ?? 0, of: v.of_days ?? 0 })}</li>)}<li>{t('trial.limitations.not_diagnosis')}</li></ul>
      {v.analytic_days_excluded > 0 && <p className="text-label text-text-muted mt-1">{t('trial.analytic_excluded', { n: v.analytic_days_excluded })}</p>}
      {trial.status === 'completed' && <p className="text-label text-text-muted mt-1">{t('trial.retest_note')}</p>}
    </Card>
  );
}

function BlindPrep({ id, onStart }: { id: string; onStart: () => void }) {
  const { t, fmtDay } = useI18n();
  const q = useQuery({ queryKey: ['schedule', id], queryFn: () => api<{ periods: { label: string; start: string; end: string }[] }>(`/trials/${id}/schedule`) });
  return (
    <Card className="mt-3"><p className="font-semibold">{t('trial.prep_title')}</p>
      <ol className="list-decimal ps-5 mt-2 text-label space-y-1"><li>{t('trial.prep_1')}</li><li>{t('trial.prep_2')}</li><li>{t('trial.prep_3')}</li></ol>
      <ul className="mt-2 text-label">{q.data?.periods.map((p) => <li key={p.label} className="flex justify-between py-1"><span className="font-medium">{p.label}</span><span>{fmtDay(p.start, { day: 'numeric', month: 'short', timeZone: 'UTC' })}–{fmtDay(p.end, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></li>)}</ul>
      <Button className="w-full mt-3" onClick={onStart}>{t('trial.start')}</Button>
    </Card>
  );
}
