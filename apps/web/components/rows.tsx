'use client';
import type { TrackerDefinition } from '@foodtrack/tracker-schema';
import type { LocalObservation } from '@/lib/db/local';
import { useI18n, type T } from '@/lib/i18n';
import { Icon } from './icons';

/** A one-line summary of any observation, derived from its definition. */
export function summarize(o: LocalObservation, def: TrackerDefinition | undefined, label: (l: { en: string; he: string }) => string, t: T): string {
  if (!def) return o.tracker_key;
  if (def.all_clear && o.values[def.all_clear.field] === def.all_clear.value && Object.keys(o.values).length === 1) return t('rows.all_clear');
  if (def.has_meal_items) {
    const names = (o.meal_items ?? []).map((i) => i.raw_text).join(', ');
    return names || String(o.values.description ?? '') || (o.parse_status === 'pending' ? t('rows.meal_reading') : t('rows.meal_unspecified'));
  }
  const parts: string[] = [];
  for (const f of def.fields) {
    const v = o.values[f.key];
    if (v === undefined || v === null || f.type === 'text' || f.advanced && parts.length >= 2) continue;
    if (f.type === 'enum') { const opt = f.options?.find((x) => x.value === v); parts.push(f.options?.some((x) => x.illustration) ? `${label(f.labels)} ${String(v)} · ${opt ? label(opt.labels) : ''}` : opt ? label(opt.labels) : String(v)); }
    else if (f.type === 'scale') parts.push(`${label(f.labels)} ${String(v)}/${f.max}`);
    else if (f.type === 'number') parts.push(`${String(v)}${f.unit ? ` ${f.unit}` : ''}`);
    else if (f.type === 'boolean' && v === true) parts.push(label(f.labels));
    if (parts.length >= 3) break;
  }
  return parts.join(' · ') || label({ en: def.labels.en.short, he: def.labels.he.short });
}

export function ObsRow({ o, def, onOpen }: { o: LocalObservation; def: TrackerDefinition | undefined; onOpen: () => void }) {
  const { fmtTime, label, t } = useI18n();
  return (
    <li>
      <button onClick={onOpen} className="w-full flex items-center gap-3 min-h-12 py-2 text-start" data-testid="obs-row">
        <span className="tabular-nums text-text-muted w-12 shrink-0">{o.time_precision === 'slot_estimate' ? '~' : ''}{fmtTime(o.occurred_at)}</span>
        <span className="text-text-muted shrink-0"><Icon name={def?.icon ?? 'note'} size={20} /></span>
        <span dir="auto" className="flex-1 truncate">{summarize(o, def, label, t)}</span>
        {o.parse_status === 'pending' && <span className="text-label text-warn">{t('rows.needs_a_moment')}</span>}
        {o.sync !== 'synced' && <span className={`text-label ${o.sync === 'failed' ? 'text-danger' : 'text-text-muted'}`} aria-label={o.sync === 'failed' ? t('sync.failed_one') : t('sync.waiting_one')} data-testid="unsynced-badge"><Icon name={o.sync === 'failed' ? 'warn' : 'up'} size={16} /></span>}
      </button>
    </li>
  );
}
