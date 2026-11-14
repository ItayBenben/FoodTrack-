'use client';
/** The clinician report (01 U8): two pages plus a diary appendix, numbers only, printed to PDF by the browser. */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui';

interface Clinical { range: { from: string; to: string }; n_days: number; bristol_distribution: Record<string, number>; stools_per_week: number; weekly: { week: string; symptom_load: number | null; score: number | null }[];
  ibs_sss_style: { items: Record<string, number>; total: number; band: string }; weights: { day: string; kg: number }[]; medications: { day: string; name: string; class: string; dose: string }[]; red_flags: { rule_key: string; raised_at: string }[]; diary: { day: string; at: string; text: string }[] }

export default function Report() {
  const { t, fmtDay, fmtTime } = useI18n(); const { phase } = useSession();
  const [c, setC] = useState<Clinical | null>(null);
  useEffect(() => { if (phase !== 'ready') return; const p = new URLSearchParams(location.search); void api<Clinical>(`/export/clinical?from=${p.get('from')}&to=${p.get('to')}`).then(setC); }, [phase]);
  if (!c) return null;
  const total = Object.values(c.bristol_distribution).reduce((s, x) => s + x, 0) || 1;
  return (
    <main className="max-w-3xl mx-auto p-6 bg-surface text-text print:p-0">
      <div className="print:hidden mb-4 flex gap-2"><Button onClick={() => window.print()}>{t('export.print')}</Button><Button variant="ghost" onClick={() => history.back()}>{t('common.back')}</Button></div>
      <h1 className="text-title font-bold">{t('report.title')}</h1>
      <p className="text-label">{fmtDay(c.range.from, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} – {fmtDay(c.range.to, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} · {t('report.days', { n: c.n_days })}</p>
      <h2 className="font-semibold mt-4">{t('report.bristol')}</h2>
      <table className="w-full text-label mt-1"><tbody>{[1, 2, 3, 4, 5, 6, 7].map((b) => <tr key={b}><td className="w-16">{t('report.type', { n: b })}</td><td><div className="h-2 bg-info rounded-pill" style={{ inlineSize: `${(100 * (c.bristol_distribution[String(b)] ?? 0)) / total}%` }} /></td><td className="w-16 text-end tabular-nums">{c.bristol_distribution[String(b)] ?? 0}</td></tr>)}</tbody></table>
      <p className="mt-1">{t('report.per_week', { n: c.stools_per_week })}</p>
      <h2 className="font-semibold mt-4">{t('report.sss')}</h2>
      <table className="w-full text-label"><tbody>{Object.entries(c.ibs_sss_style.items).map(([k, v]) => <tr key={k}><td>{t(`report.sss_item.${k}`)}</td><td className="text-end tabular-nums">{v}</td></tr>)}<tr className="font-semibold"><td>{t('report.total')}</td><td className="text-end tabular-nums">{c.ibs_sss_style.total} / 500 · {t(`report.band.${c.ibs_sss_style.band}`)}</td></tr></tbody></table>
      <p className="text-label text-text-muted">{t('report.sss_note')}</p>
      <h2 className="font-semibold mt-4">{t('report.weekly')}</h2>
      <table className="w-full text-label"><thead><tr><th className="text-start">{t('report.week')}</th><th className="text-end">{t('report.symptom_load')}</th><th className="text-end">{t('report.score')}</th></tr></thead>
        <tbody>{c.weekly.map((w) => <tr key={w.week}><td>{fmtDay(w.week, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</td><td className="text-end tabular-nums">{w.symptom_load ?? '—'}</td><td className="text-end tabular-nums">{w.score ?? '—'}</td></tr>)}</tbody></table>
      {c.weights.length > 0 && <><h2 className="font-semibold mt-4">{t('report.weight')}</h2><p className="text-label">{c.weights.map((w) => `${fmtDay(w.day, { day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${w.kg} kg`).join(' · ')}</p></>}
      <h2 className="font-semibold mt-4">{t('report.meds')}</h2>
      {c.medications.length ? <ul className="text-label" dir="auto">{c.medications.map((m, i) => <li key={i}>{fmtDay(m.day, { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {m.name} {m.dose ?? ''}</li>)}</ul> : <p className="text-label">—</p>}
      <h2 className="font-semibold mt-4">{t('report.flags')}</h2>
      {c.red_flags.length ? <ul className="text-label">{c.red_flags.map((f, i) => <li key={i}>{fmtDay(f.raised_at.slice(0, 10), { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {t(`safety.${f.rule_key}.title`)}</li>)}</ul> : <p className="text-label">—</p>}
      <h2 className="font-semibold mt-6 break-before-page">{t('report.diary')}</h2>
      <ul className="text-label">{c.diary.map((d, i) => <li key={i} dir="auto">{fmtDay(d.day, { day: 'numeric', month: 'short', timeZone: 'UTC' })} {fmtTime(d.at)} · {d.text}</li>)}</ul>
      <p className="text-label text-text-muted mt-6">{t('report.footer')}</p>
    </main>
  );
}
