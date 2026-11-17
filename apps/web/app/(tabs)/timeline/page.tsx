'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { db } from '@/lib/db/local';
import { api } from '@/lib/api';
import { ObsRow, summarize } from '@/components/rows';
import { useCapture } from '@/components/capture';
import { Empty } from '@/components/ui';
import { Icon } from '@/components/icons';

export default function Timeline() {
  const { t, fmtDay, label } = useI18n();
  const { defs } = useSession();
  const open = useCapture((s) => s.open);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [span, setSpan] = useState(30);
  const [onlyDay, setOnlyDay] = useState<string | null>(null);
  useEffect(() => { const d = new URLSearchParams(window.location.search).get('day'); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setOnlyDay(d); setSpan(Math.ceil((Date.now() - Date.parse(d)) / 86400_000) + 2); } }, []);
  const since = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - span); return d.toISOString().slice(0, 10); }, [span]);
  const obs = useLiveQuery(() => db().observations.where('local_day').aboveOrEqual(since).filter((o) => !o.deleted_at).reverse().sortBy('occurred_at'), [since], []);
  const scores = useQuery({ queryKey: ['scores-range', since], queryFn: () => api<{ data: { local_day: string; score: number | null }[] }>(`/scores/daily?from=${since}&to=${new Date().toISOString().slice(0, 10)}`) });
  const scoreBy = new Map((scores.data?.data ?? []).map((d) => [d.local_day, d.score]));
  const shown = obs.filter((o) => (!onlyDay || o.local_day === onlyDay) && (filter === 'all' || o.tracker_key === filter) && (!q || summarize(o, defs.get(o.tracker_key), label, t).toLowerCase().includes(q.toLowerCase()) || (o.note ?? '').toLowerCase().includes(q.toLowerCase())));
  const days = [...new Set(shown.map((o) => o.local_day))].sort().reverse();
  return (
    <div>
      <h1 className="text-title font-semibold">{t('tabs.timeline')}</h1>
      <div className="flex gap-2 mt-3">
        <label className="flex-1 min-w-0 flex items-center gap-2 min-h-12 rounded-chip border border-border bg-surface px-3"><Icon name="search" size={18} /><input className="flex-1 min-w-0 bg-transparent outline-none" placeholder={t('timeline.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('timeline.search')} /></label>
        <select className="min-h-12 max-w-[40%] rounded-chip border border-border bg-surface px-2" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('timeline.filter')}>
          <option value="all">{t('timeline.all')}</option>
          {[...defs.values()].map((d) => <option key={d.key} value={d.key}>{label({ en: d.labels.en.short, he: d.labels.he.short })}</option>)}
        </select>
      </div>
      {onlyDay && <button className="mt-2 min-h-12 text-accent" onClick={() => { setOnlyDay(null); history.replaceState(null, '', '/timeline'); }}>{t('timeline.show_all')}</button>}
      {days.length === 0 && <div className="mt-6"><Empty title={t('timeline.empty_title')} body={t('timeline.empty_body')} /></div>}
      {days.map((d) => (
        <section key={d} className="mt-5">
          <div className="flex items-center justify-between border-b border-border pb-1">
            <h2 className="font-semibold">{fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</h2>
            <div className="flex items-center gap-3">
              {scoreBy.get(d) != null && <span className="text-label text-text-muted tabular-nums">{t('timeline.score', { n: scoreBy.get(d)! })}</span>}
              <button className="min-h-12 min-w-12 text-accent" aria-label={t('timeline.add_to_day')} onClick={() => open([...defs.values()].find((x) => x.has_meal_items)?.key ?? 'note', { at: new Date(`${d}T12:00:00`).toISOString() })}><Icon name="plus" size={18} /></button>
            </div>
          </div>
          <ul className="divide-y divide-border">{shown.filter((o) => o.local_day === d).map((o) => <ObsRow key={o.id} o={o} def={defs.get(o.tracker_key)} onOpen={() => open(o.tracker_key, { editId: o.id })} />)}</ul>
        </section>
      ))}
      {days.length > 0 && <button className="w-full min-h-12 mt-4 text-accent" onClick={() => setSpan(span + 60)}>{t('timeline.load_more')}</button>}
    </div>
  );
}
