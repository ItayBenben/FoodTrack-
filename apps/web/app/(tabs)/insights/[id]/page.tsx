'use client';
/** The full evidence card (05 §4.7) and the audit drill-down (08 §8.5). */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { confounderLabel, effectLine, type Card as InsightCard } from '@/lib/insights';
import { BackHeader } from '@/components/back';
import { Bar, ConfidenceBadge } from '@/components/insights';
import { Button, Card, SectionTitle, useToasts } from '@/components/ui';

export default function Evidence() {
  const { id } = useParams<{ id: string }>();
  const { t, label, num, fmtDay, locale } = useI18n(); const { defs } = useSession();
  const qc = useQueryClient(); const router = useRouter(); const push = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ['insight', id], queryFn: () => api<InsightCard>(`/insights/${id}`) });
  const [showDays, setShowDays] = useState(false);
  const c = q.data; if (!c) return <div><BackHeader title={t('tabs.insights')} />{q.isError && <p className="text-warn mt-3">{t('insights.offline_body')}</p>}</div>;
  const e = c.evidence;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const binary = e.effect_type === 'risk_difference';
  return (
    <div>
      <BackHeader title={label(c.exposure.label)} />
      <div className="mt-2"><ConfidenceBadge c={c.confidence} /><p className="mt-1 text-text-muted">{t(`insights.tier_meaning.${c.confidence}`)}</p></div>
      <SectionTitle>{t('insights.observed')}</SectionTitle>
      <p>{effectLine(c, t, label, num)}</p>
      {binary ? (<>
        <Bar a={e.rate_exposed!} b={e.rate_unexposed!} la={`${t('insights.with')} (${Math.round(e.rate_exposed! * e.n_exposed_days)}/${e.n_exposed_days})`} lb={`${t('insights.without')} (${Math.round(e.rate_unexposed! * e.n_unexposed_days)}/${e.n_unexposed_days})`} />
        <p className="mt-2">{t('insights.difference_pp', { pp: Math.round(e.effect * 100) })}</p>
        <p className="text-label text-text-muted">{t('insights.interval_pp', { lo: Math.round(e.ci[0] * 100), hi: Math.round(e.ci[1] * 100) })}</p>
      </>) : (<>
        <p className="mt-2">{t('insights.means', { a: num(e.mean_exposed!, 1), b: num(e.mean_unexposed!, 1) })}</p>
        <p className="text-label text-text-muted">{t('insights.interval_mean', { lo: num(e.ci[0], 1), hi: num(e.ci[1], 1) })}</p>
      </>)}
      {c.narrative && <Card className="mt-3"><p dir="auto">{c.narrative[locale]}</p></Card>}
      <SectionTitle>{t('insights.accounted')}</SectionTitle>
      {e.adjusted_for.length ? <ul className="flex flex-wrap gap-2">{e.adjusted_for.map((a) => <li key={a} className="px-2 py-1 rounded-pill bg-surface-sunken text-label">✓ {confounderLabel(a, defs, label, t)}</li>)}</ul> : <p className="text-text-muted">{t('insights.nothing_to_adjust')}</p>}
      {e.attenuation !== null && <p className="mt-2">{e.attenuation < 0.3 ? t('insights.held', { pct: Math.max(0, Math.round(e.attenuation * 100)) }) : t('insights.weakened', { pct: Math.round(e.attenuation * 100) })}</p>}
      {Math.abs(e.rho_1) > 0.2 && <p className="text-label text-text-muted mt-1">{t('insights.autocorr')}</p>}
      {(e.warnings.length > 0 || (e.overlapping_events?.length ?? 0) > 0) && <SectionTitle>{t('insights.careful')}</SectionTitle>}
      <ul className="flex flex-col gap-1">{e.warnings.map((w, i) => <li key={i}>⚠︎ {t(`insights.warn.${w.code}`, { n: Number(w.detail?.n ?? w.detail?.n_weekend ?? 0), of: Number(w.detail?.of ?? 0), with: w.detail?.label ? label(w.detail.label as { en: string; he: string }) : String(w.detail?.with ?? '') })}</li>)}
        {e.overlapping_events?.map((o, i) => <li key={`e${i}`}>⚠︎ {t('insights.warn.overlapping_event', { n: o.days_overlapping, label: label(o.label) })}</li>)}</ul>
      <SectionTitle>{t('insights.how_strong')}</SectionTitle>
      <ul className="text-label flex flex-col gap-1">
        <li>{t('insights.q', { q: num(e.q_value, 3) })}</li>
        {e.dose_response && <li>{e.dose_response.monotone ? t('insights.dose_yes') : t('insights.dose_no')}</li>}
        {e.replication && <li>{e.replication.replicated ? t('insights.rep_yes') : t('insights.rep_no')}</li>}
        <li>{t('insights.lag_is_output')}</li>
      </ul>
      <p className="mt-4 font-medium">{t('insights.association_not_proof')}</p>
      <div className="flex flex-col gap-2 mt-4">
        {(c.confidence === 'medium' || c.confidence === 'high') && <Link href={`/more/trials/new?insight=${c.id}`} className="min-h-12 flex items-center justify-center rounded-chip bg-accent text-on-accent font-medium" data-testid="test-this">{t('insights.test_this')}</Link>}
        <Button variant="secondary" onClick={() => setShowDays(!showDays)} data-testid="see-days">{t('insights.see_days')}</Button>
        <Button variant="ghost" onClick={async () => { await api(`/insights/${id}/dismiss`, { method: 'POST' }); await qc.invalidateQueries({ queryKey: ['insights'] }); push({ text: t('insights.dismissed'), action: { label: t('common.undo'), run: () => void api(`/insights/${id}/undismiss`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['insights'] })) } }); router.back(); }}>{t('insights.not_interested')}</Button>
      </div>
      {showDays && c.days && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-label">
          {[true, false].map((ex) => (
            <div key={String(ex)}><p className="font-medium mb-1">{ex ? t('insights.days_with', { n: e.n_exposed_days }) : t('insights.days_without', { n: e.n_unexposed_days })}</p>
              <ul>{c.days!.filter((d) => d.exposed === ex).map((d) => <li key={d.day}><Link className="flex justify-between min-h-9 items-center" href={`/timeline?day=${d.day}`}><span>{fmtDay(d.day, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span><span className="tabular-nums">{binary ? (d.outcome ? '●' : '○') : num(d.outcome, 1)}</span></Link></li>)}</ul></div>))}
        </div>
      )}
      <p className="text-label text-text-muted mt-6">{binary ? pct(e.rate_exposed!) : ''}</p>
    </div>
  );
}
