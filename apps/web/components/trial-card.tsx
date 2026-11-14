'use client';
/** Today's trial card (08 §9.2): what to do today, the phase strip, adherence — and no live estimate (D21). */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { currentPhase, dayNumber, phaseLength, type Trial } from '@/lib/trials';
import { Card } from './ui';
import { Icon } from './icons';

export function PhaseStrip({ t }: { t: Trial }) {
  const { t: tr } = useI18n();
  const today = t.today ?? '';
  return (
    <div>
      <div className="flex flex-wrap gap-1 mt-2" aria-label={tr('trial.strip')}>
        {(t.days ?? []).map((d) => {
          const past = d.local_day < today;
          const cls = !past ? 'border border-border' : !d.logged ? 'border border-text-muted' : d.adherent === false ? 'border-2 border-warn' : 'bg-accent';
          return <span key={d.local_day} title={`${d.local_day} · ${tr(`trial.phase.${d.phase}`)}`} className={`h-3 w-3 rounded-pill ${cls} ${d.local_day === today ? 'outline outline-2 outline-accent' : ''}`} />;
        })}
      </div>
      <p className="text-label text-text-muted mt-1">{tr('trial.legend')}</p>
    </div>
  );
}

export function TrialCard() {
  const { t, label } = useI18n();
  const q = useQuery({ queryKey: ['trials'], queryFn: () => api<{ data: Trial[] }>('/trials') });
  const tr = q.data?.data.find((x) => x.status === 'active' || x.status === 'paused');
  const detail = useQuery({ queryKey: ['trial', tr?.id], enabled: Boolean(tr), queryFn: () => api<Trial>(`/trials/${tr!.id}`) });
  if (!tr) return null;
  const full = detail.data ?? tr;
  const p = currentPhase(full);
  const name = label(full.target_label);
  return (
    <Card className="mt-3" data-testid="trial-card">
      <Link href={`/more/trials/${full.id}`} className="block">
        <p className="font-semibold flex items-center gap-2"><Icon name="trial" size={18} />{t('trial.card_title', { name })}</p>
        {full.status === 'paused' ? <p className="mt-1">{t('trial.paused_line')}</p> : p ? (<>
          <p className="mt-1">{t(`trial.today.${p.phase}`, { name, dose: p.dose ? label(p.dose) : '' })}</p>
          <p className="text-label text-text-muted">{t('trial.day_of', { n: dayNumber(full, p), of: phaseLength(p), phase: t(`trial.phase.${p.phase}`) })}</p>
        </>) : <p className="mt-1">{t('trial.not_started')}</p>}
        {detail.data && <PhaseStrip t={detail.data} />}
        <p className="text-label text-text-muted mt-1">{t('trial.no_live_estimate')}</p>
      </Link>
    </Card>
  );
}
