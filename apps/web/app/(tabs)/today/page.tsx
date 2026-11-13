'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { db } from '@/lib/db/local';
import { dayOf, saveObservation } from '@/lib/store';
import { api } from '@/lib/api';
import { Icon } from '@/components/icons';
import { Card, SectionTitle } from '@/components/ui';
import { ObsRow } from '@/components/rows';
import { SyncBadge } from '@/components/sync';
import { RedFlags } from '@/components/redflags';
import { TrackerPicker, useCapture } from '@/components/capture';
import { TrialCard } from '@/components/trial-card';
import { Spark } from '@/components/spark';

interface Favorite { food_ids: string[]; label: string; items: { raw_text: string; food_id: string; canonical_name: string; quantity: number | null; unit: string | null; grams_est: number | null }[]; times_logged: number }

export default function Today() {
  const { t, fmtDay, label, num } = useI18n();
  const { user, defs, trackers } = useSession();
  const open = useCapture((s) => s.open);
  const [picker, setPicker] = useState(false);
  const today = dayOf(new Date().toISOString(), user);
  const obs = useLiveQuery(() => db().observations.where('local_day').equals(today).filter((o) => !o.deleted_at).sortBy('occurred_at'), [today], []);
  const anyEver = useLiveQuery(() => db().observations.count(), [], 0);
  const drafts = useLiveQuery(() => db().drafts.toArray(), [], []);
  const score = useQuery({ queryKey: ['scores', today], queryFn: () => api<{ data: { local_day: string; score: number | null; components: { key: string; weight: number; penalty: number; labels: { en: string; he: string } }[] }[] }>(`/scores/daily?from=${shift(today, -6)}&to=${today}`) });
  const favs = useQuery({ queryKey: ['favorites', new Date().getHours()], queryFn: () => api<{ data: Favorite[] }>(`/meals/favorites?at=${encodeURIComponent(new Date().toISOString())}`) });
  const [scoreOpen, setScoreOpen] = useState(false);

  const enabled = useMemo(() => trackers.filter((x) => x.enabled && defs.has(x.tracker_key)), [trackers, defs]);
  const grid = enabled.filter((x) => defs.get(x.tracker_key)!.quick_log?.home_shortcut).slice(0, 4);
  const checkinDef = [...defs.values()].find((d) => d.counts_as_checkin && enabled.some((x) => x.tracker_key === d.key));
  const hasCheckin = checkinDef && obs.some((o) => o.tracker_key === checkinDef.key);
  const evening = new Date().getHours() >= 18;
  const days = score.data?.data ?? [];
  const todayScore = days.find((d) => d.local_day === today);
  const mealDef = [...defs.values()].find((d) => d.has_meal_items);

  return (
    <div>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-title font-semibold">{fmtDay(today)}</h1>
        <SyncBadge />
      </header>
      <RedFlags />
      <TrialCard />
      {drafts.map((d) => (
        <Card key={d.id} className="mt-3 flex items-center gap-3">
          <span className="flex-1">{t('today.draft_row', { name: label({ en: defs.get(d.tracker_key)?.labels.en.short ?? d.tracker_key, he: defs.get(d.tracker_key)?.labels.he.short ?? d.tracker_key }) })}</span>
          <button className="min-h-12 px-3 text-accent font-medium" onClick={() => open(d.tracker_key)}>{t('today.resume')}</button>
          <button className="min-h-12 px-3 text-text-muted" onClick={() => void db().drafts.delete(d.id)}>{t('today.discard')}</button>
        </Card>
      ))}
      {checkinDef && evening && !hasCheckin && (
        <Card className="mt-3 flex items-center gap-3"><span className="flex-1 font-medium">{t('today.checkin_prompt')}</span><button className="min-h-12 px-4 rounded-chip bg-accent text-on-accent" onClick={() => open(checkinDef.key)}>{t('today.checkin_cta')}</button></Card>
      )}
      {todayScore?.score != null ? (
        <Card className="mt-3">
          <button className="w-full flex items-center justify-between min-h-12" onClick={() => setScoreOpen(!scoreOpen)} aria-expanded={scoreOpen}>
            <span>{t('today.score_title')}</span><span className="text-title font-semibold tabular-nums">{num(todayScore.score)} / 100</span>
          </button>
          <Spark values={days.map((d) => d.score)} />
          {scoreOpen && <div className="mt-2 text-label">{todayScore.components.map((c) => <div key={c.key} className="flex justify-between py-1"><span>{label(c.labels)} <span className="text-text-muted">({t('today.weight', { w: c.weight })})</span></span><span className="tabular-nums">−{num(c.penalty, 1)}</span></div>)}<p className="text-text-muted mt-1">{t('today.score_default_weighting')}</p></div>}
        </Card>
      ) : null}

      <SectionTitle>{t('today.quick_log')}</SectionTitle>
      <div className="grid grid-cols-4 gap-2" data-testid="quick-grid">
        {grid.map((x) => { const d = defs.get(x.tracker_key)!; return (
          <button key={x.tracker_key} onClick={() => open(x.tracker_key)} data-testid={`quick-${x.tracker_key}`} className="flex flex-col items-center justify-center gap-1 min-h-20 rounded-card bg-surface border border-border">
            <Icon name={d.icon} size={26} /><span className="text-label">{label({ en: d.labels.en.short, he: d.labels.he.short })}</span></button>); })}
        {enabled.length > grid.length && <button onClick={() => setPicker(true)} className="flex flex-col items-center justify-center gap-1 min-h-20 rounded-card bg-surface border border-border" data-testid="quick-more"><Icon name="more" size={26} /><span className="text-label">{t('capture.more_trackers')}</span></button>}
      </div>

      {(favs.data?.data.length ?? 0) > 0 && mealDef && (
        <>
          <SectionTitle>{t('today.usual')}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {favs.data!.data.slice(0, 4).map((f) => (
              <button key={f.food_ids.join()} className="text-start rounded-card bg-surface border border-border p-3 min-h-16" data-testid="usual-tile"
                onClick={() => void saveObservation({ tracker_key: mealDef.key, values: { description: f.label }, meal_items: f.items.map((i, n) => ({ ...i, confidence: 0.95, resolved_by: 'library', portion_precision: 'estimated', position: n })) })}>
                <span dir="auto" className="block font-medium truncate">{f.label}</span><span className="text-label text-text-muted">{t('today.logged_n', { n: f.times_logged })}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>{t('today.so_far')}</SectionTitle>
      {obs.length ? <ul data-testid="today-list" className="divide-y divide-border">{obs.map((o) => <ObsRow key={o.id} o={o} def={defs.get(o.tracker_key)} onOpen={() => open(o.tracker_key, { editId: o.id })} />)}</ul>
        : <p className="text-text-muted">{t('today.nothing_yet')}</p>}

      {anyEver < 30 && (
        <Card className="mt-6">
          <p className="font-semibold">{t('today.next_title')}</p>
          <ul className="mt-2 list-disc ps-5 text-text-muted"><li>{t('today.next_1')}</li><li>{t('today.next_2')}</li><li>{t('today.next_3')}</li></ul>
          <Link className="text-accent min-h-12 inline-flex items-center" href="/more/how">{t('today.how')}</Link>
        </Card>
      )}
      <TrackerPicker open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}

function shift(day: string, n: number) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

