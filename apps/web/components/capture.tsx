'use client';
/**
 * Capture sheets, chosen from the DEFINITION, never from the tracker key (CLAUDE.md rule 1):
 *  - quick_log.primary_field is an enum      → QuickPick: one tap saves, extras after (05 §4.3)
 *  - group_by_field                          → Grouped: several observations in one pass (08 §4.8)
 *  - has_meal_items                          → the meal composer (M3)
 *  - anything else                           → TrackerForm, with "Nothing to report" if all_clear is declared
 * Save writes to IndexedDB and closes within 100 ms; the network is never awaited (08 §4.0).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { uuidv7 } from '@foodtrack/shared';
import { validateValues, visibleFields, type TrackerDefinition } from '@foodtrack/tracker-schema';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { db } from '@/lib/db/local';
import { deleteLocal, editObservation, saveObservation, undoDelete } from '@/lib/store';
import type { LocalObservation } from '@/lib/db/local';
import { Button, Sheet, SegmentedScale, useToasts } from './ui';
import { FieldInput, TileGrid, TimestampControl } from './fields';
import { MealComposer } from './meal-composer';

interface CaptureState { key: string | null; editId: string | null; at: string | null; open: (key: string, opts?: { editId?: string; at?: string }) => void; close: () => void }
export const useCapture = create<CaptureState>((set) => ({ key: null, editId: null, at: null, open: (key, o) => set({ key, editId: o?.editId ?? null, at: o?.at ?? null }), close: () => set({ key: null, editId: null, at: null }) }));

export function CaptureHost() {
  const { key, editId, at, close } = useCapture();
  const { defs } = useSession();
  const def = key ? defs.get(key) : undefined;
  if (!key || !def) return null;
  if (def.has_meal_items) return <MealComposer def={def} editId={editId} at={at} onClose={close} />;
  if (!editId && def.quick_log?.primary_field && def.fields.find((f) => f.key === def.quick_log!.primary_field)?.type === 'enum') return <QuickPick def={def} at={at} onClose={close} />;
  if (!editId && def.group_by_field) return <Grouped def={def} at={at} onClose={close} />;
  return <TrackerForm def={def} editId={editId} at={at} onClose={close} />;
}

export function useDeleteWithUndo() {
  const { t } = useI18n(); const push = useToasts((s) => s.push);
  return useCallback(async (o: LocalObservation) => {
    await deleteLocal(o.id);
    push({ text: t('toast.deleted'), action: { label: t('common.undo'), run: () => void undoDelete(o.id) } });
  }, [push, t]);
}

function useTimestamp(at: string | null) {
  const [ts, setTs] = useState<string | null>(at);
  // an untouched placeholder time (e.g. noon from the timeline) is not a time the person set (rule 8)
  return { ts, setTs, timeSource: (!ts ? 'now' : ts === at ? 'default' : 'user_set') as 'now' | 'default' | 'user_set' };
}

// ───────── QuickPick ─────────
function QuickPick({ def, at, onClose }: { def: TrackerDefinition; at: string | null; onClose: () => void }) {
  const { t, label } = useI18n();
  const primary = def.fields.find((f) => f.key === def.quick_log!.primary_field)!;
  const { ts, setTs, timeSource } = useTimestamp(at);
  const [saved, setSaved] = useState<LocalObservation | null>(null);
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setCountdown(null); };
  useEffect(() => () => stop(), []);

  const pick = async (v: unknown) => {
    const o = await saveObservation({ tracker_key: def.key, values: { [primary.key]: v }, occurred_at: ts ?? undefined, time_source: timeSource });
    setSaved(o); setCountdown(3);
    timer.current = setInterval(() => setCountdown((c) => { if (c === null) return null; if (c <= 1) { stop(); onClose(); return null; } return c - 1; }), 1000);
  };
  const setExtra = async (k: string, v: unknown) => {
    stop();
    const next = { ...extras, [k]: v }; setExtras(next);
    if (saved) await editObservation(saved.id, { values: { [k]: v } });
  };
  const others = def.fields.filter((f) => f.key !== primary.key && f.type !== 'text');
  return (
    <Sheet open onClose={onClose} title={label({ en: def.labels.en.name, he: def.labels.he.name })} testid={`sheet-${def.key}`} headerExtra={<TimestampControl value={ts} onChange={setTs} />}>
      <TileGrid field={primary} value={saved?.values[primary.key]} onPick={pick} />
      {saved && (
        <div className="mt-4" onPointerDown={stop}>
          <p className="text-accent font-medium flex items-center gap-2" data-testid="saved-mark">✓ {t('capture.saved_add_more')}{countdown !== null && <span className="text-text-muted">{t('capture.closing_in', { n: countdown })}</span>}</p>
          {countdown !== null && <div className="h-0.5 bg-accent mt-1 transition-all" style={{ inlineSize: `${(countdown / 3) * 100}%` }} />}
          <div className="flex flex-wrap gap-2 mt-2">
            {others.map((f) => <div key={f.key} className={f.type === 'boolean' ? '' : 'w-full'}><FieldInput field={f} value={extras[f.key]} onChange={(v) => void setExtra(f.key, v)} /></div>)}
          </div>
          <Button className="w-full mt-4" variant="secondary" onClick={onClose}>{t('common.done')}</Button>
        </div>
      )}
    </Sheet>
  );
}

// ───────── Grouped (e.g. several symptoms at once) ─────────
function Grouped({ def, at, onClose }: { def: TrackerDefinition; at: string | null; onClose: () => void }) {
  const { t, label } = useI18n();
  const sel = def.fields.find((f) => f.key === def.group_by_field)!;
  const sev = def.fields.find((f) => f.key === def.quick_log?.primary_field) ?? def.fields.find((f) => f.type === 'scale')!;
  const { ts, setTs, timeSource } = useTimestamp(at);
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [more, setMore] = useState(false);
  const clear = def.all_clear;
  const kinds = sel.options!.filter((o) => !(clear && clear.field === sel.key && o.value === clear.value));
  const draftKey = `draft_${def.key}`;
  useEffect(() => { void db().drafts.get(draftKey).then((d) => { if (d) { setPicked((d.data.picked as Record<string, number>) ?? {}); setExtra((d.data.extra as Record<string, unknown>) ?? {}); } }); }, [draftKey]);
  const push = useToasts((s) => s.push);
  const dirty = Object.values(picked).some((v) => v !== null && v !== undefined);
  const close = async (saved: boolean) => {
    if (!saved && dirty) { await db().drafts.put({ id: draftKey, tracker_key: def.key, created_at: new Date().toISOString(), data: { picked, extra } }); push({ text: t('toast.draft_kept'), action: { label: t('common.undo'), run: () => void db().drafts.delete(draftKey) } }); }
    else await db().drafts.delete(draftKey);
    onClose();
  };
  const save = async () => {
    const group = uuidv7();
    const entries = Object.entries(picked).filter(([, v]) => v !== null && v !== undefined);
    for (const [k, v] of entries) await saveObservation({ tracker_key: def.key, values: { [sel.key]: k, [sev.key]: v, ...extra }, occurred_at: ts ?? undefined, time_source: timeSource, group_id: entries.length > 1 ? group : null });
    void close(true);
  };
  const nothing = async () => { if (clear) await saveObservation({ tracker_key: def.key, values: { [clear.field]: clear.value }, occurred_at: ts ?? undefined, time_source: timeSource }); void close(true); };
  const advanced = def.fields.filter((f) => f.key !== sel.key && f.key !== sev.key && f.type !== 'text');
  return (
    <Sheet open onClose={() => void close(false)} title={label({ en: def.labels.en.name, he: def.labels.he.name })} testid={`sheet-${def.key}`} headerExtra={<TimestampControl value={ts} onChange={setTs} />}>
      {kinds.map((k) => (
        <div key={String(k.value)} className="my-3">
          <div className="flex items-center justify-between"><span className="font-medium">{label(k.labels)}</span>{picked[String(k.value)] != null && <button className="text-text-muted text-label min-h-12 px-2" onClick={() => setPicked({ ...picked, [String(k.value)]: null })}>{t('common.clear')}</button>}</div>
          <SegmentedScale min={sev.min!} max={sev.max!} value={picked[String(k.value)] ?? null} onChange={(v) => setPicked({ ...picked, [String(k.value)]: v })} label={label(k.labels)} />
        </div>
      ))}
      <button className="text-accent min-h-12" onClick={() => setMore(!more)}>{more ? t('capture.fewer_details') : t('capture.more_details')}</button>
      {more && advanced.filter((f) => visibleFields(def, { ...extra, [sel.key]: Object.keys(picked)[0] }).includes(f)).map((f) => <FieldInput key={f.key} field={f} value={extra[f.key]} onChange={(v) => setExtra({ ...extra, [f.key]: v })} />)}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {clear && <Button variant="secondary" onClick={() => void nothing()} data-testid="nothing-to-report">{t('capture.nothing_to_report')}</Button>}
        <Button onClick={() => void save()} className={clear ? '' : 'col-span-2'} data-testid="save">{t('common.save')}</Button>
      </div>
    </Sheet>
  );
}

// ───────── generic form (also edit for any tracker) ─────────
export function TrackerForm({ def, editId, at, onClose }: { def: TrackerDefinition; editId: string | null; at: string | null; onClose: () => void }) {
  const { t, label } = useI18n();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState<string>('');
  const { ts, setTs, timeSource } = useTimestamp(at);
  const [existing, setExisting] = useState<LocalObservation | null>(null);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const del = useDeleteWithUndo();
  useEffect(() => { if (editId) void db().observations.get(editId).then((o) => { if (o) { setExisting(o); setValues(o.values); setNote(o.note ?? ''); setTs(o.occurred_at); } }); }, [editId, setTs]);
  const fields = useMemo(() => visibleFields(def, values), [def, values]);
  const main = fields.filter((f) => !f.advanced && f.key !== def.all_clear?.field);
  const adv = fields.filter((f) => f.advanced);
  const save = async () => {
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== '' && v !== undefined));
    const issues = validateValues(def, clean).filter((i) => i.code !== 'unknown_field');
    if (issues.length) { setErrors(issues.map((i) => i.message)); return; }
    if (existing) {
      const removed = Object.fromEntries(Object.keys(existing.values).filter((k) => !(k in clean)).map((k) => [k, null]));
      await editObservation(existing.id, { values: { ...removed, ...clean }, note: note || null, ...(ts && ts !== existing.occurred_at ? { occurred_at: ts, time_source: 'user_set' } : {}) });
    } else await saveObservation({ tracker_key: def.key, values: clean, note: note || null, occurred_at: ts ?? undefined, time_source: timeSource });
    onClose();
  };
  const nothing = async () => { await saveObservation({ tracker_key: def.key, values: { ...values, [def.all_clear!.field]: def.all_clear!.value }, occurred_at: ts ?? undefined }); onClose(); };
  return (
    <Sheet open onClose={onClose} title={existing ? t('capture.edit_title', { name: label({ en: def.labels.en.name, he: def.labels.he.name }) }) : label({ en: def.labels.en.name, he: def.labels.he.name })} testid={`sheet-${def.key}`} headerExtra={<TimestampControl value={ts} onChange={setTs} />}>
      {main.map((f) => <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues({ ...values, [f.key]: v })} />)}
      {adv.length > 0 && <button className="text-accent min-h-12" onClick={() => setMore(!more)}>{more ? t('capture.fewer_details') : t('capture.more_details')}</button>}
      {more && adv.map((f) => <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues({ ...values, [f.key]: v })} />)}
      {errors.length > 0 && <div role="alert" className="text-danger mt-2">{errors.map((e) => <p key={e}>{e}</p>)}</div>}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {def.all_clear && !existing && <Button variant="secondary" onClick={() => void nothing()} data-testid="nothing-to-report">{t('capture.nothing_to_report')}</Button>}
        <Button onClick={() => void save()} className={def.all_clear && !existing ? '' : 'col-span-2'} data-testid="save">{existing ? t('common.save_changes') : t('common.done')}</Button>
      </div>
      {existing && <Button variant="ghost" className="w-full mt-2 text-danger" onClick={() => { void del(existing); onClose(); }}>{t('common.delete')}</Button>}
    </Sheet>
  );
}

/** The guaranteed path to every enabled tracker (08 §4.1). */
export function TrackerPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, label } = useI18n();
  const { defs, trackers } = useSession();
  const openCap = useCapture((s) => s.open);
  const [q, setQ] = useState('');
  const list = trackers.filter((x) => x.enabled && defs.has(x.tracker_key)).map((x) => defs.get(x.tracker_key)!);
  const shown = list.filter((d) => !q || label({ en: d.labels.en.name, he: d.labels.he.name }).toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title={t('capture.picker_title')} testid="tracker-picker">
      {list.length > 10 && <input className="w-full min-h-12 rounded-chip border border-border bg-surface px-3 mb-2" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />}
      <ul>{shown.map((d) => <li key={d.key}><button className="w-full min-h-12 text-start py-3 border-b border-border" onClick={() => { onClose(); openCap(d.key); }}>{label({ en: d.labels.en.name, he: d.labels.he.name })}</button></li>)}</ul>
    </Sheet>
  );
}
