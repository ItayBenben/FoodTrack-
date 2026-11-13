'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Icon } from './icons';
import { Button } from './ui';

interface Flag { id: string; rule_key: string; raised_at: string; acknowledged_at: string | null }

/** Red flags outrank everything and only ever say "see a doctor" (CLAUDE.md safety). Never a toast. */
export function RedFlags() {
  const { t } = useI18n(); const qc = useQueryClient(); const { events } = useSession();
  const q = useQuery({ queryKey: ['safety-flags'], queryFn: () => api<{ active: Flag[] }>('/safety-flags') });
  useEffect(() => { const h = () => void qc.invalidateQueries({ queryKey: ['safety-flags'] }); events.addEventListener('safety.flag_raised', h); return () => events.removeEventListener('safety.flag_raised', h); }, [events, qc]);
  const active = q.data?.active ?? [];
  if (!active.length) return null;
  return (
    <div className="flex flex-col gap-2 mb-3" data-testid="red-flags">
      {active.map((f) => (
        <div key={f.id} role="alert" className="rounded-card border border-danger bg-danger-soft p-4">
          <p className="font-semibold text-danger flex items-center gap-2"><Icon name="warn" size={20} />{t(`safety.${f.rule_key}.title`)}</p>
          <p className="mt-1">{t(`safety.${f.rule_key}.body`)}</p>
          <p className="mt-1 text-label text-text-muted">{t('safety.not_diagnosis')}</p>
          <Button variant="secondary" className="mt-3" onClick={async () => { await api(`/safety-flags/${f.id}/acknowledge`, { method: 'POST' }); void qc.invalidateQueries({ queryKey: ['safety-flags'] }); }}>{t('safety.acknowledge')}</Button>
        </div>
      ))}
    </div>
  );
}
