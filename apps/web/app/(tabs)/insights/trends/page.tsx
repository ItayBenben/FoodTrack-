'use client';
/** Trends (05 U6): one chart per `charts` entry in the enabled trackers' definitions. Outcome colours are neutral (05 §2.1). */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BackHeader } from '@/components/back';
import { Card, Chip, Empty } from '@/components/ui';

interface ChartDef { key: string; tracker: string; type: string; labels: { en: { name: string }; he: { name: string } } }
type Series = { type: string; series?: { day: string; value: number | boolean | null }[]; bins?: { value: number | string; labels: { en: string; he: string }; count: number }[]; good_range?: [number, number] | null; unit?: string | null };

function Chart({ def, days }: { def: ChartDef; days: number }) {
  const { label, num, t } = useI18n();
  const q = useQuery({ queryKey: ['chart', def.key, days], queryFn: () => api<Series>(`/charts/${def.key}?days=${days}`) });
  const d = q.data;
  return (
    <Card className="mt-3">
      <p className="font-medium">{label({ en: def.labels.en.name, he: def.labels.he.name })}</p>
      {d?.bins && (() => { const max = Math.max(1, ...d.bins.map((b) => b.count)); return (
        <div className="flex items-end gap-1 h-28 mt-2" role="img" aria-label={d.bins.map((b) => `${b.value}: ${b.count}`).join(', ')}>
          {d.bins.map((b) => <div key={String(b.value)} className="flex-1 flex flex-col items-center"><div className="w-full rounded-t-chip bg-info" style={{ blockSize: `${(b.count / max) * 96}px` }} /><span className="text-label tabular-nums">{String(b.value)}</span></div>)}
        </div>); })()}
      {d?.series && (() => {
        const pts = d.series.map((s, i) => ({ i, v: s.value === null ? null : Number(s.value) })).filter((p) => p.v !== null) as { i: number; v: number }[];
        if (pts.length < 2) return <p className="text-label text-text-muted mt-2">{t('trends.not_enough')}</p>;
        const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)), n = d.series.length - 1 || 1;
        const y = (v: number) => 56 - ((v - lo) / (hi - lo || 1)) * 52;
        return (<svg viewBox="0 0 100 60" className="w-full h-32 mt-2 flip-rtl text-info" role="img" aria-label={`${num(lo, 1)}–${num(hi, 1)}`}>
          {d.type === 'bar' ? pts.map((p) => <rect key={p.i} x={(p.i / n) * 98} y={y(p.v)} width={Math.max(0.6, 90 / n)} height={58 - y(p.v)} fill="currentColor" />)
            : <polyline fill="none" stroke="currentColor" strokeWidth="1" points={pts.map((p) => `${(p.i / n) * 100},${y(p.v)}`).join(' ')} />}
        </svg>);
      })()}
      {d?.series && <p className="text-label text-text-muted">{t('trends.range_note')}</p>}
    </Card>
  );
}

export default function Trends() {
  const { t } = useI18n(); const [days, setDays] = useState(90);
  const q = useQuery({ queryKey: ['charts'], queryFn: () => api<{ data: ChartDef[] }>('/charts') });
  return (
    <div><BackHeader title={t('trends.title')} />
      <div className="flex gap-2 mt-2">{[30, 90, 365].map((n) => <Chip key={n} on={days === n} onClick={() => setDays(n)}>{t('trends.days', { n })}</Chip>)}</div>
      {q.data?.data.length === 0 && <div className="mt-4"><Empty title={t('trends.none')} /></div>}
      {q.data?.data.map((c) => <Chart key={c.key} def={c} days={days} />)}
    </div>
  );
}
