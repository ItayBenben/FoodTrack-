'use client';
/** The trial proposal (S80): design, schedule, power, guardrails — and an honest statement of the trade. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Phase } from '@/lib/trials';
import { BackHeader } from '@/components/back';
import { Button, Card, Chip, SectionTitle } from '@/components/ui';

interface Proposal { target: { label: { en: string; he: string } }; design: string; phases: Phase[]; total_days: number; baseline_reused: boolean; hypothesis: { minimum_interesting_effect: number; outcome_type: string; primary_outcome: string };
  power: { power: number; adequate: boolean } | null; nutrition_note: { nutrients: string[] } | null; blinding: { available: boolean; dose: { en: string; he: string } | null; vehicle: string | null } }

export default function NewTrial() {
  const { t, label, fmtDay } = useI18n(); const router = useRouter();
  const [insight, setInsight] = useState<string | null>(null);
  const [p, setP] = useState<Proposal | null>(null); const [err, setErr] = useState<ApiError | null>(null);
  const [elim, setElim] = useState(21); const [blind, setBlind] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { setInsight(new URLSearchParams(window.location.search).get('insight')); }, []);
  useEffect(() => {
    if (!insight) return;
    api<Proposal>('/trials/propose', { method: 'POST', body: { insight_id: insight, ...(blind ? { preferred_design: 'D' } : {}) } }).then((x) => { setP(x); setErr(null); }).catch((e) => setErr(e as ApiError));
  }, [insight, blind]);
  const start = async () => {
    setBusy(true);
    try { const r = await api<{ id: string }>('/trials', { method: 'POST', body: { insight_id: insight, elimination_days: elim, ...(blind ? { preferred_design: 'D' } : {}) } }); router.replace(`/more/trials/${r.id}`); }
    catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  const reason = err?.problem.reason as string | undefined;
  return (
    <div><BackHeader title={t('trial.propose_title')} />
      {err && (<Card className="mt-3"><p className="font-semibold">{reason ? t(`trial.guard.${reason}.title`) : t('trial.error_title')}</p>
        <p className="mt-1">{reason ? t(`trial.guard.${reason}.body`, { name: label((err.problem.target_label as { en: string; he: string }) ?? { en: '', he: '' }) }) : err.problem.detail}</p>
        {reason === 'active_trial_exists' && <Link className="mt-2 inline-flex min-h-12 items-center text-accent" href={`/more/trials/${err.problem.trial_id}`}>{t('trial.see_running')}</Link>}
        {reason === 'elimination_cap' && <Link className="mt-2 inline-flex min-h-12 items-center text-accent" href="/more/avoid">{t('trial.reintroduce')}</Link>}</Card>)}
      {p && (<>
        <h2 className="text-title font-semibold mt-3" dir="auto">{label(p.target.label)}</h2>
        <p className="mt-1">{t(`trial.design_explain.${p.design}`)}</p>
        {p.design !== 'D' && <p className="mt-2 text-label px-2 py-1 rounded-chip bg-warn-soft inline-block" data-testid="open-label">{t('trial.open_label')}</p>}
        {p.blinding.available && <label className="flex items-center gap-3 mt-3 min-h-12"><input type="checkbox" className="h-5 w-5" checked={blind} onChange={(e) => setBlind(e.target.checked)} />{t('trial.blind_option', { dose: p.blinding.dose ? label(p.blinding.dose) : '' })}</label>}
        <SectionTitle>{t('trial.schedule')}</SectionTitle>
        <ul className="text-label">{p.phases.map((x, i) => <li key={i} className="py-1 flex justify-between"><span>{t(`trial.phase.${x.phase}`)}{x.dose ? ` · ${label(x.dose)}` : ''}</span><span className="tabular-nums">{fmtDay(x.start, { day: 'numeric', month: 'short', timeZone: 'UTC' })}–{fmtDay(x.end, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></li>)}</ul>
        {p.baseline_reused && <p className="text-label text-text-muted mt-1">{t('trial.baseline_reused')}</p>}
        <p className="mt-2">{t('trial.why_three_weeks')}</p>
        {p.design === 'A' && (<div className="mt-2"><p className="text-label text-text-muted">{t('trial.adjust_elim')}</p><div className="flex gap-2 mt-1">{[15, 21, 28, 35].map((n) => <Chip key={n} on={elim === n} onClick={() => setElim(n)}>{t('trial.n_days', { n })}</Chip>)}</div></div>)}
        <SectionTitle>{t('trial.prereg')}</SectionTitle>
        <p className="text-label">{t('trial.prereg_line', { mie: p.hypothesis.outcome_type === 'binary' ? `${Math.round(p.hypothesis.minimum_interesting_effect * 100)} pp` : String(p.hypothesis.minimum_interesting_effect) })}</p>
        <p className="text-label text-text-muted">{t('trial.locked_note')}</p>
        <p className="mt-2 text-label">{p.power ? (p.power.adequate ? t('trial.power_ok') : t('trial.power_low')) : t('trial.power_unknown')}</p>
        {p.nutrition_note && <Card className="mt-3"><p className="text-label">{t('trial.nutrition', { list: p.nutrition_note.nutrients.map((n) => t(`trial.nutrient.${n}`)).join(', ') })}</p></Card>}
        <Button className="w-full mt-4" disabled={busy} onClick={() => void start()} data-testid="start-trial">{p.design === 'D' ? t('trial.prepare') : t('trial.start')}</Button>
        <Button variant="ghost" className="w-full mt-2" onClick={() => router.back()}>{t('trial.not_now')}</Button>
      </>)}
    </div>
  );
}
