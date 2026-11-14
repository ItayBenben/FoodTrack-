'use client';
/** Reminders (D16). Autosaved. Notification text never names a symptom, food or finding; red flags are never pushed. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BackHeader } from '@/components/back';
import { Button, Card } from '@/components/ui';

interface R { data: { kind: string; enabled: boolean; at_time: string | null }[]; quiet_from: string; quiet_to: string; paused_until: string | null }

function b64(s: string) { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); }

export default function Reminders() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['reminders'], queryFn: () => api<R>('/me/reminders') });
  const [pushState, setPush] = useState<string | null>(null);
  const save = async (body: unknown) => { await api('/me/reminders', { method: 'PUT', body }); void q.refetch(); };
  const enablePush = async () => {
    try {
      const { key } = await api<{ key: string }>('/push/vapid-key');
      if ((await Notification.requestPermission()) !== 'granted') { setPush('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api('/push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys, device_label: navigator.userAgent.slice(0, 60) } });
      setPush('on');
    } catch (e) { setPush(e instanceof ApiError && e.status === 404 ? 'not_configured' : 'failed'); }
  };
  const d = q.data;
  return (
    <div><BackHeader title={t('more.reminders')} />
      <Card className="mt-3"><Button onClick={() => void enablePush()}>{t('reminders.enable_push')}</Button>{pushState && <p className="mt-2 text-label" role="status">{t(`reminders.push.${pushState}`)}</p>}
        <p className="text-label text-text-muted mt-2">{t('reminders.privacy')}</p></Card>
      {d && <Card className="mt-3">
        {d.data.map((r) => (
          <div key={r.kind} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            <label className="flex-1 flex items-center gap-3 min-h-12"><input type="checkbox" className="h-5 w-5" checked={r.enabled} onChange={(e) => void save({ reminders: [{ kind: r.kind, enabled: e.target.checked }] })} />{t(`reminders.kind.${r.kind}`)}</label>
            <input type="time" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-2" value={(r.at_time ?? '').slice(0, 5)} onChange={(e) => void save({ reminders: [{ kind: r.kind, enabled: r.enabled, at_time: e.target.value }] })} aria-label={t('reminders.time')} />
          </div>))}
        <div className="flex items-center gap-2 mt-3"><span className="flex-1">{t('reminders.quiet')}</span>
          <input type="time" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-2" value={d.quiet_from.slice(0, 5)} onChange={(e) => void save({ quiet_from: e.target.value })} aria-label={t('reminders.quiet_from')} />–
          <input type="time" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-2" value={d.quiet_to.slice(0, 5)} onChange={(e) => void save({ quiet_to: e.target.value })} aria-label={t('reminders.quiet_to')} /></div>
        <Button variant="secondary" className="w-full mt-3" onClick={() => void save({ paused_until: d.paused_until ? null : new Date(Date.now() + 7 * 86400_000).toISOString() })}>{d.paused_until ? t('reminders.unpause') : t('reminders.pause_week')}</Button>
      </Card>}
    </div>
  );
}
