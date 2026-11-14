'use client';
/**
 * The day builder (08 §4.15) — logging at night is the normal case (CLAUDE.md rule 8).
 * One field per slot, times prefilled from your own medians and marked "~". Confirm-discard on leave.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { syncNow } from '@/lib/store';
import { BackHeader } from '@/components/back';
import { Button, Card, Chip, useToasts } from '@/components/ui';

interface Slot { slot: string; median_time: string | null; n: number; fallback_time: string; time_precision: string; observations: { id: string; values: { description?: string }; occurred_at: string }[] }

export default function DayBuilder() {
  const { t, fmtDay, fmtTime } = useI18n();
  const router = useRouter(); const push = useToasts((s) => s.push);
  const [date, setDate] = useState(() => { const d = new Date(); if (d.getHours() < 12) d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [text, setText] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [paste, setPaste] = useState(''); const [err, setErr] = useState<string | null>(null); const [weight, setWeight] = useState<number | null>(null);
  const load = async () => {
    try {
      const r = await api<{ slots: Slot[]; day_weight: { value: number } }>(`/days/${date}/builder`);
      setSlots(r.slots); setWeight(r.day_weight.value);
      setText(Object.fromEntries(r.slots.map((s) => [s.slot, s.observations[0]?.values.description ?? ''])));
      setTimes({}); setErr(null);
    } catch (e) { setErr(e instanceof ApiError && e.offline ? t('builder.offline') : (e as Error).message); }
  };
  useEffect(() => { void load(); }, [date]);
  const dirty = slots.some((s) => (s.observations[0]?.values.description ?? '') !== (text[s.slot] ?? '')) || Object.keys(times).length > 0;
  const save = async () => {
    const body = slots.filter((s) => (s.observations[0]?.values.description ?? '') !== (text[s.slot] ?? '') || times[s.slot]).map((s) => ({
      slot: s.slot, observation_id: s.observations[0]?.id ?? null, text: text[s.slot] ?? '',
      ...(times[s.slot] ? { occurred_at: new Date(`${date}T${times[s.slot]}:00`).toISOString(), time_source: 'user_set' } : {}) }));
    const r = await api<{ batch_id: string }>(`/days/${date}/builder`, { method: 'POST', body: { slots: body } });
    push({ text: t('builder.saved'), action: { label: t('common.undo'), run: async () => { await api(`/batches/${r.batch_id}`, { method: 'DELETE' }); await syncNow(); void load(); } } });
    await syncNow(); void load();
  };
  const distribute = async () => {
    const r = await api<{ proposal: { slot: string; text: string; time: string | null }[] }>('/meals/parse-multiline', { method: 'POST', body: { text: paste } });
    const next = { ...text }; const nt = { ...times };
    for (const p of r.proposal) { next[p.slot] = next[p.slot] ? `${next[p.slot]}, ${p.text}` : p.text; if (p.time) nt[p.slot] = p.time; }
    setText(next); setTimes(nt); setPaste('');
  };
  return (
    <div>
      <BackHeader title={t('more.day_builder')} extra={<button className="min-h-12 px-2 text-accent" onClick={() => { if (!dirty || confirm(t('builder.discard_confirm'))) router.back(); }}>{t('common.close')}</button>} />
      <div className="flex items-center gap-2 mt-2"><input type="date" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-3" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} aria-label={t('builder.date')} /><span className="text-text-muted">{fmtDay(date)}</span></div>
      {err && <p role="alert" className="text-warn mt-3">{err}</p>}
      {weight !== null && <p className="text-label text-text-muted mt-2">{t('builder.weight', { pct: Math.round(weight * 100) })}</p>}
      {slots.map((s) => (
        <Card key={s.slot} className="mt-3">
          <div className="flex items-center justify-between"><span className="font-medium">{t(`builder.slot.${s.slot}`)}</span>
            <label className="text-label text-text-muted flex items-center gap-1">{times[s.slot] ? '' : '~'}
              <input type="time" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-2" value={times[s.slot] ?? (s.observations[0] ? fmtTime(s.observations[0].occurred_at) : (s.median_time ?? s.fallback_time))} onChange={(e) => setTimes({ ...times, [s.slot]: e.target.value })} aria-label={t('builder.time')} /></label></div>
          <textarea dir="auto" rows={2} className="w-full mt-2 rounded-chip border border-border bg-surface p-3" value={text[s.slot] ?? ''} onChange={(e) => setText({ ...text, [s.slot]: e.target.value })} aria-label={t(`builder.slot.${s.slot}`)} data-testid={`builder-${s.slot}`} />
          {!s.median_time && <p className="text-label text-text-muted">{t('builder.no_median')}</p>}
        </Card>
      ))}
      <Card className="mt-4"><p className="text-label text-text-muted">{t('builder.paste_hint')}</p>
        <textarea dir="auto" rows={3} className="w-full mt-2 rounded-chip border border-border bg-surface p-3" value={paste} onChange={(e) => setPaste(e.target.value)} aria-label={t('builder.paste')} />
        <Chip onClick={() => void distribute()}>{t('builder.distribute')}</Chip></Card>
      <p className="text-label text-text-muted mt-3">{t('builder.estimates_note')}</p>
      <Button className="w-full mt-3" disabled={!dirty} onClick={() => void save()} data-testid="builder-save">{t('common.save')}</Button>
    </div>
  );
}
