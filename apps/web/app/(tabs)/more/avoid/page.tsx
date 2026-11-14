'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BackHeader } from '@/components/back';
import { Empty, useToasts } from '@/components/ui';

/** The avoid list (08 §9.7). A marker, never a scold. */
export default function Avoid() {
  const { t, label, fmtDay } = useI18n(); const push = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ['avoid'], queryFn: () => api<{ data: { id: string; label: { en: string; he: string }; reason: string; added_at: string; kind: string; ref: string }[] }>('/avoid') });
  return (
    <div><BackHeader title={t('more.avoid')} />
      <p className="text-text-muted mt-2">{t('avoid.explain')}</p>
      {q.data?.data.length === 0 && <div className="mt-4"><Empty title={t('avoid.empty')} /></div>}
      <ul className="mt-3 divide-y divide-border">{q.data?.data.map((e) => (
        <li key={e.id} className="py-3 flex items-center gap-3"><div className="flex-1"><p dir="auto" className="font-medium">{label(e.label)}</p><p className="text-label text-text-muted">{t(`avoid.reason.${e.reason}`)} · {fmtDay(e.added_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</p></div>
          <button className="min-h-12 px-3 text-accent" onClick={async () => { await api(`/avoid/${e.id}`, { method: 'DELETE' }); void q.refetch(); push({ text: t('avoid.removed'), action: { label: t('common.undo'), run: async () => { await api('/avoid', { method: 'POST', body: { kind: e.kind, ref: e.ref, label: e.label, reason: e.reason } }); void q.refetch(); } } }); }}>{t('avoid.remove')}</button></li>))}</ul>
    </div>
  );
}
