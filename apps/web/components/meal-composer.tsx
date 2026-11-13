'use client';
/**
 * Meal composer (05 §4.2, 08 §4.2). Save is always enabled; the text is saved even if
 * nothing parsed. Parsing (M3) streams items in; offline, the meal saves unparsed and the
 * server parses it when it arrives ("needs a moment").
 */
import { useEffect, useRef, useState } from 'react';
import type { TrackerDefinition } from '@foodtrack/tracker-schema';
import type { MealItemInput } from '@foodtrack/shared';
import { useI18n } from '@/lib/i18n';
import { db, type LocalObservation } from '@/lib/db/local';
import { editObservation, saveObservation } from '@/lib/store';
import { useParse, type ParsedItem } from '@/lib/meals';
import { Button, Chip, Sheet, useToasts } from './ui';
import { TimestampControl } from './fields';
import { Icon } from './icons';

const DRAFT = 'draft_meal';

export function MealComposer({ def, editId, at, onClose }: { def: TrackerDefinition; editId: string | null; at: string | null; onClose: () => void }) {
  const { t, label } = useI18n();
  const [text, setText] = useState('');
  const [slot, setSlot] = useState<string | null>(null);
  const [ts, setTs] = useState<string | null>(at);
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [existing, setExisting] = useState<LocalObservation | null>(null);
  const push = useToasts((s) => s.push);
  const ref = useRef<HTMLTextAreaElement>(null);
  const parse = useParse(text, ts);
  const slotField = def.fields.find((f) => f.key === 'slot' && f.type === 'enum');

  useEffect(() => {
    if (editId) { void db().observations.get(editId).then((o) => { if (!o) return; setExisting(o); setText(String(o.values.description ?? '')); setSlot((o.values.slot as string) ?? null); setTs(o.occurred_at); setItems((o.meal_items ?? []) as ParsedItem[]); }); }
    else void db().drafts.get(DRAFT).then((d) => { if (d) { setText(String(d.data.text ?? '')); setSlot((d.data.slot as string) ?? null); } });
    setTimeout(() => ref.current?.focus(), 30);
  }, [editId]);
  useEffect(() => { if (parse.items) setItems(parse.items); }, [parse.items]);

  const close = async (saved: boolean) => {
    if (!saved && !editId && text.trim()) {
      await db().drafts.put({ id: DRAFT, tracker_key: def.key, created_at: new Date().toISOString(), data: { text, slot } });
      push({ text: t('toast.draft_kept'), action: { label: t('common.undo'), run: () => void db().drafts.delete(DRAFT) } });
    } else if (saved) await db().drafts.delete(DRAFT);
    onClose();
  };
  const save = async () => {
    const values: Record<string, unknown> = {};
    if (text.trim()) values.description = text.trim();
    if (slot) values.slot = slot;
    const meal_items: MealItemInput[] | undefined = items?.length ? items.map((i, n) => ({ raw_text: i.raw_text, food_id: i.food_id, quantity: i.quantity, unit: i.unit, grams_est: i.grams_est, confidence: i.confidence, resolved_by: i.resolved_by, portion_precision: i.portion_precision, position: n, ...(i.canonical_name ? { canonical_name: i.canonical_name } : {}) } as MealItemInput)) : undefined;
    if (existing) await editObservation(existing.id, { values, meal_items, ...(ts && ts !== existing.occurred_at ? { occurred_at: ts, time_source: 'user_set' } : {}) });
    else await saveObservation({ tracker_key: def.key, values, meal_items, occurred_at: ts ?? undefined, time_source: ts ? 'user_set' : 'now' });
    void close(true);
  };
  return (
    <Sheet open onClose={() => void close(false)} title={existing ? t('meal.edit_title') : t('meal.title')} testid="sheet-meal" headerExtra={<TimestampControl value={ts} onChange={setTs} />}>
      <textarea ref={ref} data-autofocus dir="auto" rows={3} className="w-full rounded-card border border-border bg-surface p-3 text-body" placeholder={t('meal.placeholder')}
        value={text} onChange={(e) => setText(e.target.value)} data-testid="meal-text" aria-label={t('meal.title')} />
      {slotField && (
        <div className="flex flex-wrap gap-2 mt-2">
          {slotField.options!.map((o) => <Chip key={String(o.value)} on={slot === o.value} onClick={() => setSlot(slot === o.value ? null : String(o.value))}>{label(o.labels)}</Chip>)}
        </div>
      )}
      <div className="mt-3">
        <div className="flex items-center justify-between text-label text-text-muted">
          <span>{t('meal.parsed')}</span>
          <span>{parse.state === 'parsing' ? t('meal.updating') : parse.state === 'offline' ? t('meal.parse_later') : parse.degraded ? t('meal.parse_degraded') : ''}</span>
        </div>
        <ul data-testid="parsed-items">
          {(items ?? []).map((i, n) => (
            <li key={`${i.raw_text}-${n}`} className="flex items-center gap-2 py-2 border-b border-border">
              <span dir="auto" className={`flex-1 ${i.confidence !== null && i.confidence < 0.6 ? 'underline decoration-dotted' : ''}`}>{i.raw_text}{i.confidence !== null && i.confidence < 0.6 ? ' ?' : ''}</span>
              <span className="text-text-muted text-label" dir="auto">{i.canonical_name ?? t('meal.unresolved')}</span>
              <span className="tabular-nums text-label">{i.quantity ?? ''} {i.unit ? t(`units.${i.unit}`) : ''}</span>
              <button aria-label={t('meal.remove_item')} className="min-h-12 min-w-12 text-text-muted" onClick={() => { const prev = items!; setItems(prev.filter((_, k) => k !== n)); push({ text: t('toast.item_removed'), action: { label: t('common.undo'), run: () => setItems(prev) } }); }}><Icon name="close" size={18} /></button>
            </li>
          ))}
        </ul>
        {parse.addOns.length > 0 && (
          <div className="mt-2"><p className="text-label text-text-muted">{t('meal.invisible_prompt')}</p>
            <div className="flex flex-wrap gap-2 mt-1">{parse.addOns.map((a) => <Chip key={a.food_id} onClick={() => setItems([...(items ?? []), { ...a, raw_text: a.label }])}>+ {a.label}</Chip>)}</div>
          </div>
        )}
      </div>
      <Button className="w-full mt-4" onClick={() => void save()} data-testid="save">{existing ? t('common.save_changes') : t('common.save')}</Button>
    </Sheet>
  );
}
