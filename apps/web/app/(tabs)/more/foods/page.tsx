'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BackHeader } from '@/components/back';
import { Button, Empty, Sheet } from '@/components/ui';

interface LibRow { food_id: string; canonical_name: string; alias: string | null; times_logged: number; median_qty: number | null; median_unit: string | null; median_grams: number | null; source: string; is_verified: boolean }

/** F5 (08 §6): the personal library — the real asset. LLM-created foods can be merged into a canonical one. */
export default function Foods() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['library'], queryFn: () => api<{ data: LibRow[] }>('/foods/library') });
  const [merge, setMerge] = useState<LibRow | null>(null);
  const [search, setSearch] = useState(''); const [hits, setHits] = useState<{ id: string; canonical_name: string }[]>([]);
  return (
    <div><BackHeader title={t('more.foods')} />
      <p className="text-text-muted mt-2">{t('foods.explain')}</p>
      {q.data?.data.length === 0 && <div className="mt-4"><Empty title={t('foods.empty')} /></div>}
      {q.isError && <p className="text-warn mt-3">{t('deleted.offline')}</p>}
      <ul className="mt-3 divide-y divide-border">{q.data?.data.map((f) => (
        <li key={f.food_id} className="py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0"><p dir="auto" className="font-medium truncate">{f.alias ?? f.canonical_name}</p>
            <p className="text-label text-text-muted" dir="auto">{f.canonical_name} · {t('today.logged_n', { n: f.times_logged })}{f.median_grams ? ` · ${t('foods.usual', { g: Math.round(f.median_grams) })}` : ''}</p>
            {f.source === 'llm' && !f.is_verified && <p className="text-label text-warn">{t('foods.unverified')}</p>}</div>
          {f.source !== 'seed' && <button className="min-h-12 px-3 text-accent" onClick={() => { setMerge(f); setSearch(f.canonical_name); }}>{t('foods.merge')}</button>}
        </li>))}</ul>
      <Sheet open={Boolean(merge)} onClose={() => setMerge(null)} title={t('foods.merge_title')}>
        <p className="text-text-muted">{t('foods.merge_explain')}</p>
        <input className="w-full min-h-12 rounded-chip border border-border bg-surface px-3 mt-2" value={search} dir="auto"
          onChange={async (e) => { setSearch(e.target.value); if (e.target.value.length > 1) setHits((await api<{ data: { id: string; canonical_name: string }[] }>(`/foods/search?q=${encodeURIComponent(e.target.value)}`)).data.filter((h) => h.id !== merge?.food_id)); }} aria-label={t('common.search')} />
        <ul className="mt-2">{hits.map((h) => <li key={h.id}><Button variant="secondary" className="w-full mt-1" onClick={async () => { await api(`/foods/${merge!.food_id}/merge`, { method: 'POST', body: { into: h.id } }); setMerge(null); void q.refetch(); }}>{h.canonical_name}</Button></li>)}</ul>
      </Sheet>
    </div>
  );
}
