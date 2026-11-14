'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { useCapture } from './capture';
import { useToasts } from './ui';

/** What SSE events do to the UI (08 §1.7). Red flags are never toasts — they have their own banner. */
export function EventToasts() {
  const { events, defs } = useSession(); const { t, fmtTime, label } = useI18n(); const push = useToasts((s) => s.push); const open = useCapture((s) => s.open); const qc = useQueryClient();
  useEffect(() => {
    const parsed = (e: Event) => {
      const d = (e as CustomEvent).detail as { observation_id: string; n_items: number; occurred_at: string };
      const meal = [...defs.values()].find((x) => x.has_meal_items)?.key;
      if (d.n_items > 0) push({ text: t('toast.parse_completed', { time: fmtTime(d.occurred_at), n: d.n_items }), action: meal ? { label: t('common.edit'), run: () => open(meal, { editId: d.observation_id }) } : undefined });
    };
    const exposure = (e: Event) => {
      const d = (e as CustomEvent).detail as { trial_id: string; local_day: string; target_label: { en: string; he: string }; items: string[] };
      push({ text: t('trial.exposure_prompt', { name: label(d.target_label), items: d.items.join(', ') }), ms: 20000, action: { label: t('trial.yes_slip'), run: () => void api(`/trials/${d.trial_id}/days/${d.local_day}`, { method: 'POST', body: { adherent: false } }) } });
      void qc.invalidateQueries({ queryKey: ['trial'] });
    };
    events.addEventListener('trial.exposure_detected', exposure);
    const analysed = () => { void qc.invalidateQueries({ queryKey: ['insights'] }); };
    events.addEventListener('parse.completed', parsed); events.addEventListener('analysis.completed', analysed);
    return () => { events.removeEventListener('parse.completed', parsed); events.removeEventListener('analysis.completed', analysed); events.removeEventListener('trial.exposure_detected', exposure); };
  }, [events, defs, t, fmtTime, label, push, open, qc]);
  return null;
}
