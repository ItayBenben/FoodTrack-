'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { BackHeader } from '@/components/back';
import { Chip, SectionTitle } from '@/components/ui';

/** Autosaved (08 §1.2): every toggle commits immediately. */
export default function Trackers() {
  const { t, label } = useI18n(); const { defs, trackers, reload } = useSession();
  const packs = useQuery({ queryKey: ['me-packs'], queryFn: () => api<{ data: { key: string; labels: { en: string; he: string }; description: { en: string; he: string }; active: boolean }[] }>('/me/packs') });
  const toggle = async (key: string, enabled: boolean) => { await api('/me/trackers', { method: 'PUT', body: [{ tracker_key: key, enabled }] }); await reload(); };
  const on = new Map(trackers.map((x) => [x.tracker_key, x.enabled]));
  return (
    <div><BackHeader title={t('more.trackers')} />
      <SectionTitle>{t('trackers.packs')}</SectionTitle>
      {packs.data?.data.map((p) => (
        <div key={p.key} className="flex items-center gap-3 py-2"><div className="flex-1"><p className="font-medium">{label(p.labels)}</p><p className="text-label text-text-muted">{label(p.description)}</p></div>
          <Chip on={p.active} onClick={async () => { await api(`/me/packs/${p.key}/${p.active ? 'remove' : 'apply'}`, { method: 'POST' }); await reload(); void packs.refetch(); }}>{p.active ? t('trackers.pack_on') : t('trackers.pack_add')}</Chip></div>))}
      <SectionTitle>{t('trackers.all')}</SectionTitle>
      <ul className="divide-y divide-border">{[...defs.values()].map((d) => (
        <li key={d.key} className="flex items-center gap-3 py-2"><span className="flex-1">{label({ en: d.labels.en.name, he: d.labels.he.name })}</span>
          <Chip on={on.get(d.key) ?? false} onClick={() => void toggle(d.key, !(on.get(d.key) ?? false))}>{on.get(d.key) ? t('trackers.on') : t('trackers.off')}</Chip></li>))}</ul>
      <p className="text-label text-text-muted mt-3">{t('trackers.data_kept')}</p>
    </div>
  );
}
