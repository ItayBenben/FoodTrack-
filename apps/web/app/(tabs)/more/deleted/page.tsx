'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { db, type LocalObservation } from '@/lib/db/local';
import { BackHeader } from '@/components/back';
import { summarize } from '@/components/rows';
import { Empty } from '@/components/ui';

export default function Deleted() {
  const { t, label, fmtDay, fmtTime } = useI18n(); const { defs } = useSession(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['deleted'], queryFn: () => api<{ data: (LocalObservation & { deleted_at: string })[] }>('/observations/deleted') });
  const restore = async (o: LocalObservation) => { const r = await api<LocalObservation>(`/observations/${o.id}/restore`, { method: 'POST' }); await db().observations.put({ ...r, time_source: 'user_set', sync: 'synced' }); void qc.invalidateQueries({ queryKey: ['deleted'] }); };
  return (
    <div><BackHeader title={t('more.deleted')} />
      <p className="text-text-muted mt-2">{t('deleted.explain')}</p>
      {q.isError && <p className="text-warn mt-3">{t('deleted.offline')}</p>}
      {q.data?.data.length === 0 && <div className="mt-4"><Empty title={t('deleted.empty')} /></div>}
      <ul className="mt-3 divide-y divide-border">{q.data?.data.map((o) => (
        <li key={o.id} className="flex items-center gap-3 py-2"><span className="flex-1" dir="auto">{fmtDay(o.local_day, { day: 'numeric', month: 'short', timeZone: 'UTC' })} {fmtTime(o.occurred_at)} · {summarize(o, defs.get(o.tracker_key), label, t)}</span><button className="min-h-12 px-3 text-accent" onClick={() => void restore(o)}>{t('deleted.restore')}</button></li>))}</ul>
    </div>
  );
}
