'use client';
/**
 * Insights (05 §4.6, 08 §8). Observational findings are suspicions; the copy never says "causes".
 * "Ruled out" is a headline section. Red flags de-emphasise everything here.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { effectLine, type Card as InsightCard } from '@/lib/insights';
import { Button, Card, Empty, SectionTitle } from './ui';

interface Resp {
  state: 'not_enough_days' | 'never_run' | 'ready'; days_logged?: number; days_needed?: number; red_flag_active: boolean;
  last_run: { id: string; status: string; finished_at: string | null; error: string | null; summary: Record<string, unknown> } | null;
  summary?: { n_days_logged: number; n_days_analysed: number; n_days_estimated_times: number; transit_applied: boolean };
  sections: { worth_testing: InsightCard[]; early_signals: InsightCard[]; ruled_out: InsightCard[]; confirmed: InsightCard[]; not_enough_data: { exposure_ref: string; exposure_label: { en: string; he: string }; n_exposed: number; days_more: number | null; suppressed: string | null }[] } | null;
}

export function ConfidenceBadge({ c }: { c: string }) {
  const { t } = useI18n();
  const cls = c === 'high' || c === 'medium' ? 'bg-accent-soft text-accent' : 'bg-surface-sunken text-text-muted';
  return <span className={`text-label font-medium px-2 py-0.5 rounded-pill ${cls}`}>{c === 'low' ? '○' : '●'} {t(`insights.tier.${c}`)}</span>;
}

export function Bar({ a, b, la, lb }: { a: number; b: number; la: string; lb: string }) {
  return (
    <div className="mt-2 text-label" aria-hidden="true">
      {[[la, a], [lb, b]].map(([l, v]) => (
        <div key={String(l)} className="flex items-center gap-2 mt-1">
          <span className="w-28 shrink-0 truncate">{l}</span>
          <div className="flex-1 h-2 rounded-pill bg-surface-sunken"><div className="h-2 rounded-pill bg-info" style={{ inlineSize: `${Math.round(Number(v) * 100)}%` }} /></div>
          <span className="tabular-nums w-10 text-end">{Math.round(Number(v) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function InsightRow({ c }: { c: InsightCard }) {
  const { t, label, num } = useI18n();
  const e = c.evidence;
  return (
    <Card className="mt-2">
      <Link href={`/insights/${c.id}`} className="block" data-testid="insight-card">
        <div className="flex items-center justify-between gap-2"><span className="font-semibold" dir="auto">{label(c.exposure.label)}</span><ConfidenceBadge c={c.confidence} /></div>
        <p className="mt-1">{effectLine(c, t, label, num)}</p>
        <p className="text-label text-text-muted">{t('insights.n_days', { a: e.n_exposed_days, b: e.n_unexposed_days })}</p>
        {(c.also_as?.length ?? 0) > 0 && <p className="text-label text-text-muted" dir="auto">{t('insights.same_days_as', { names: c.also_as!.map((a) => label(a.label)).join(', ') })}</p>}
        {(c.also_outcomes?.length ?? 0) > 0 && <p className="text-label text-text-muted" dir="auto">{t('insights.also_seen', { names: c.also_outcomes!.map((o) => label(o.label)).join(', ') })}</p>}
        {e.effect_type === 'risk_difference' && e.rate_exposed !== undefined && <Bar a={e.rate_exposed} b={e.rate_unexposed!} la={t('insights.with')} lb={t('insights.without')} />}
      </Link>
      {(c.confidence === 'medium' || c.confidence === 'high') && <Link href={`/more/trials/new?insight=${c.id}`} className="mt-3 inline-flex min-h-12 items-center px-4 rounded-chip bg-accent text-on-accent font-medium">{t('insights.test_this')}</Link>}
    </Card>
  );
}

export function InsightsScreen() {
  const { t, label, fmtTime } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['insights'], queryFn: () => api<Resp>('/insights') });
  const [early, setEarly] = useState(false);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try { await api('/analysis/run', { method: 'POST', body: {} }); } catch { /* shown below */ }
    const poll = setInterval(async () => { await qc.invalidateQueries({ queryKey: ['insights'] }); const d = qc.getQueryData<Resp>(['insights']); if (d?.last_run?.status !== 'running') { clearInterval(poll); setRunning(false); } }, 2000);
  };
  const d = q.data;
  return (
    <div>
      <h1 className="text-title font-semibold">{t('tabs.insights')}</h1>
      {q.isError && <div className="mt-4"><Empty title={t('insights.offline_title')} body={q.error instanceof ApiError && q.error.offline ? t('insights.offline_body') : String(q.error)} /></div>}
      {d?.state === 'not_enough_days' && <div className="mt-4"><Empty title={t('insights.not_yet_title')} body={t('insights.need_days', { have: d.days_logged ?? 0, need: d.days_needed ?? 21 })} /></div>}
      {d?.state === 'never_run' && <div className="mt-4"><Empty title={t('insights.never_run_title')} body={t('insights.never_run_body')}><Button className="mt-4" onClick={() => void run()} disabled={running}>{t('insights.run_now')}</Button></Empty></div>}
      {d?.last_run?.status === 'failed' && <p role="alert" className="text-warn mt-3">{d.last_run.error ?? t('insights.run_failed')}</p>}
      {d?.state === 'ready' && d.sections && (
        <div className={d.red_flag_active ? 'opacity-60' : ''}>
          <Card className="mt-3 flex items-center gap-3">
            <div className="flex-1"><p>{t('insights.based_on', { n: d.summary?.n_days_logged ?? 0, m: d.summary?.n_days_analysed ?? 0 })}</p>
              {d.last_run?.finished_at && <p className="text-label text-text-muted">{t('insights.last_run', { time: fmtTime(d.last_run.finished_at) })}</p>}
              {(d.summary?.n_days_estimated_times ?? 0) > 0 && <p className="text-label text-text-muted">{t('insights.estimated_note', { n: d.summary!.n_days_estimated_times, of: d.summary!.n_days_analysed })}</p>}</div>
            <Button variant="secondary" onClick={() => void run()} disabled={running} aria-label={t('insights.run_now')}>{running ? t('insights.running') : '⟳'}</Button>
          </Card>
          {d.red_flag_active && <p className="mt-2 text-label">{t('insights.red_flag_first')}</p>}
          {d.sections.ruled_out.length > 0 && (<><SectionTitle>{t('insights.ruled_out')}</SectionTitle>
            {d.sections.ruled_out.map((c) => <Card key={c.id} className="mt-2"><p className="font-semibold" dir="auto">{label(c.exposure.label)} · ✓ {t('insights.ruled_out_line')}</p><p className="text-text-muted">{t('insights.ruled_out_body')}</p></Card>)}</>)}
          <SectionTitle>{t('insights.worth_testing')}</SectionTitle>
          {d.sections.worth_testing.length === 0 ? <p className="text-text-muted">{t('insights.nothing_stands_out')}</p> : d.sections.worth_testing.map((c) => <InsightRow key={c.id} c={c} />)}
          {d.sections.early_signals.length > 0 && (<>
            <button className="w-full flex justify-between items-center mt-6 min-h-12" onClick={() => setEarly(!early)} aria-expanded={early}><span className="text-label font-medium tracking-wide uppercase text-text-muted">{t('insights.early_signals')}</span><span>{early ? '⌃' : '⌄'}</span></button>
            {early && <><p className="text-label text-text-muted">{t('insights.early_explain')}</p>{d.sections.early_signals.map((c) => <InsightRow key={c.id} c={c} />)}</>}</>)}
          {d.sections.not_enough_data.length > 0 && (<><SectionTitle>{t('insights.not_enough')}</SectionTitle>
            <ul className="text-label">{d.sections.not_enough_data.slice(0, 8).map((n) => <li key={n.exposure_ref} className="py-1" dir="auto">{label(n.exposure_label)} · {n.days_more ? t('insights.days_more', { n: n.days_more, k: n.n_exposed }) : n.suppressed === 'too_rare' ? t('insights.too_rare') : t('insights.too_long')}</li>)}</ul></>)}
          <p className="text-label text-text-muted mt-6">{t('insights.footer')}</p>
        </div>
      )}
    </div>
  );
}
