'use client';
/**
 * Meal composer (05 §4.2, 08 §4.2–4.6). Text, photo, voice, favourites, repeat-last.
 * Save is always enabled. Draft-kept on dismiss. Tier 3 entries get ONE clarify step whose
 * options come from the user's own history, never from a model (08 §4.3b).
 */
import { useEffect, useRef, useState } from 'react';
import type { TrackerDefinition } from '@foodtrack/tracker-schema';
import type { MealItemInput } from '@foodtrack/shared';
import { uuidv7 } from '@foodtrack/shared';
import { useI18n } from '@/lib/i18n';
import { api, getAccessToken } from '@/lib/api';
import { db, deviceId, type LocalObservation } from '@/lib/db/local';
import { editObservation, saveObservation } from '@/lib/store';
import { useParse, type ParsedItem } from '@/lib/meals';
import { admit, mergeItems, parseMealPhoto, prepareMealPhoto } from '@/lib/photos';
import { Button, Chip, Sheet, useToasts } from './ui';
import { TimestampControl } from './fields';
import { Icon } from './icons';

const DRAFT = 'draft_meal';
interface Suggestion { id: string; label: string; times_logged: number }

export function MealComposer({ def, editId, at, onClose }: { def: TrackerDefinition; editId: string | null; at: string | null; onClose: () => void }) {
  const { t, label } = useI18n();
  const [text, setText] = useState('');
  const [slot, setSlot] = useState<string | null>(null);
  const [ts, setTs] = useState<string | null>(at);
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [photos, setPhotos] = useState<{ id: string; url: string; blob?: Blob }[]>([]);
  const [existing, setExisting] = useState<LocalObservation | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [clarify, setClarify] = useState<Suggestion[] | null>(null);
  const [favs, setFavs] = useState(false);
  const [listening, setListening] = useState(false);
  const push = useToasts((s) => s.push);
  const ref = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photoSource, setPhotoSource] = useState(false);
  const [photoItems, setPhotoItems] = useState<ParsedItem[]>([]);
  const [reading, setReading] = useState(0);
  const [vision, setVision] = useState<'on' | 'off' | 'unavailable' | null>(null);
  const parse = useParse(text, ts);
  const slotField = def.fields.find((f) => f.key === 'slot' && f.type === 'enum');
  const photoField = def.fields.find((f) => f.type === 'multi_photo');
  const SpeechRec = typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition) : undefined;

  useEffect(() => {
    if (editId) void db().observations.get(editId).then((o) => { if (!o) return; setExisting(o); setText(String(o.values.description ?? '')); setSlot((o.values.slot as string) ?? null); setTs(o.occurred_at); setItems((o.meal_items ?? []) as ParsedItem[]); setPhotos(((o.values.photos as string[]) ?? []).map((id) => ({ id, url: `/api/v1/media/${id}` }))); });
    else void db().drafts.get(DRAFT).then((d) => { if (d) { setText(String(d.data.text ?? '')); setSlot((d.data.slot as string) ?? null); } });
    setTimeout(() => ref.current?.focus(), 30);
  }, [editId]);
  useEffect(() => { if (parse.items && !existing) setItems(mergeItems(parse.items, photoItems)); }, [parse.items, existing, photoItems]);

  const close = async (saved: boolean) => {
    if (!saved && !editId && (text.trim() || photos.length)) {
      await db().drafts.put({ id: DRAFT, tracker_key: def.key, created_at: new Date().toISOString(), data: { text, slot } });
      push({ text: t('toast.draft_kept'), action: { label: t('common.undo'), run: () => void db().drafts.delete(DRAFT) } });
    } else if (saved) await db().drafts.delete(DRAFT);
    onClose();
  };

  const doSave = async (opts: { unspecified?: boolean; extra?: ParsedItem[] } = {}) => {
    const all = [...(items ?? []), ...(opts.extra ?? [])];
    const values: Record<string, unknown> = {};
    if (text.trim()) values.description = text.trim();
    if (slot) values.slot = slot;
    if (photoField && photos.length) values[photoField.key] = photos.map((p) => p.id);
    const meal_items: MealItemInput[] | undefined = all.length ? all.map((i, n) => ({ raw_text: i.raw_text, food_id: i.food_id, quantity: i.quantity, unit: i.unit, grams_est: i.grams_est, confidence: i.confidence, resolved_by: (i.resolved_by ?? undefined) as MealItemInput['resolved_by'], portion_precision: (i.portion_precision ?? 'unspecified') as MealItemInput['portion_precision'], position: n, ...(i.canonical_name ? { canonical_name: i.canonical_name } : {}) })) : undefined;
    let id = existing?.id;
    if (existing) await editObservation(existing.id, { values, meal_items, ...(ts && ts !== existing.occurred_at ? { occurred_at: ts, time_source: 'user_set' } : {}) });
    else id = (await saveObservation({ tracker_key: def.key, values, meal_items, occurred_at: ts ?? undefined, time_source: !ts ? 'now' : ts === at ? 'default' : 'user_set', ...(opts.unspecified ? { specificity: 'unspecified' as const } : {}) })).id;
    for (const p of photos.filter((x) => x.blob)) await db().media_queue.put({ id: p.id, observation_id: id!, blob: p.blob!, created_at: new Date().toISOString() });
    if (opts.unspecified) push({ text: t('meal.unspecified_saved') });
    void close(true);
  };

  const save = async () => {
    // Tier 3 (no food content) → the clarify step, once; never for tier 1–2, never blocking.
    const confident = (items ?? []).filter((i) => i.food_id && (i.confidence ?? 0) >= 0.6).length;
    if (!existing && clarify === null && text.trim() && confident === 0 && parse.state === 'done') {
      try {
        const r = await api<{ data: Suggestion[] }>(`/meals/suggestions?at=${encodeURIComponent(ts ?? new Date().toISOString())}`);
        setClarify(r.data); return;
      } catch { /* offline: save as written; the server will parse it later */ }
    }
    await doSave();
  };

  const maxPhotos = photoField?.max_items ?? 4;
  /** Camera gives one file, the library several. Each is shrunk on-device, then shown at once; nothing is uploaded until save. */
  const addPhotos = async (files: File[]) => {
    const { take, dropped } = admit(photos.length, maxPhotos, files.filter((f) => f.type.startsWith('image/') || f.type === ''));
    if (dropped > 0) push({ text: t('meal.photo_limit', { n: maxPhotos }) });
    for (const f of take) {
      const blob = await prepareMealPhoto(f);
      const local = `local_${uuidv7()}`;
      setPhotos((prev) => (prev.length >= maxPhotos ? prev : [...prev, { id: local, url: URL.createObjectURL(blob), blob }]));
      void readPhoto(local, blob);
    }
  };
  /** Online: upload now and let the vision model name the foods. Offline or failed: the photo stays queued and uploads with the meal. */
  const readPhoto = async (local: string, blob: Blob) => {
    const token = getAccessToken(); if (!token) return;
    setReading((n) => n + 1);
    try {
      const r = await parseMealPhoto(blob, { authorization: `Bearer ${token}`, 'x-device-id': await deviceId() });
      if (!r) return;
      setPhotos((prev) => prev.map((p) => (p.id === local ? { id: r.media_id, url: p.url } : p)));
      setVision(r.vision);
      if (r.items.length) {
        const found = r.items as ParsedItem[];
        setPhotoItems((prev) => mergeItems(prev, found));
        setItems((prev) => mergeItems(prev ?? [], found));
      }
    } finally { setReading((n) => n - 1); }
  };
  const removePhoto = (id: string) => {
    const prev = photos;
    setPhotos(prev.filter((x) => x.id !== id));
    push({ text: t('toast.photo_removed'), action: { label: t('common.undo'), run: () => setPhotos(prev) } });
  };
  const pick = (which: 'camera' | 'gallery') => { setPhotoSource(false); (which === 'camera' ? cameraRef : galleryRef).current?.click(); };

  const listen = () => {
    if (!SpeechRec) return;
    const r = new SpeechRec(); r.lang = document.documentElement.lang === 'he' ? 'he-IL' : 'en-US'; r.interimResults = true;
    r.onresult = (e) => { setText(Array.from(e.results).map((x) => x[0]!.transcript).join(' ')); };
    r.onend = () => setListening(false); setListening(true); r.start();
  };

  const repeatLast = async () => {
    const last = (await db().observations.where('tracker_key').equals(def.key).filter((o) => !o.deleted_at && o.id !== editId).sortBy('occurred_at')).pop();
    if (!last) { push({ text: t('meal.no_last') }); return; }
    setText(String(last.values.description ?? '')); setItems((last.meal_items ?? []) as ParsedItem[]);
  };

  if (clarify !== null) return (
    <Sheet open onClose={() => void close(false)} title={t('meal.clarify_title')} testid="clarify">
      <p dir="auto" className="text-text-muted">“{text}”</p>
      <p className="mt-2">{clarify.length ? t('meal.clarify_question') : t('meal.clarify_hint')}</p>
      <ul className="mt-3 flex flex-col gap-2">{clarify.map((s) => (
        <li key={s.id}><button className="w-full min-h-12 text-start rounded-card bg-surface border border-border px-4 py-3 flex justify-between" onClick={() => void doSave({ extra: [{ raw_text: s.label, food_id: s.id, canonical_name: s.label, quantity: null, unit: null, grams_est: null, confidence: 0.9, resolved_by: 'user', portion_precision: 'unspecified' }] })}>
          <span dir="auto">{s.label}</span><span className="text-text-muted text-label">{t('meal.times_here', { n: s.times_logged })}</span></button></li>))}</ul>
      <Button variant="secondary" className="w-full mt-3" onClick={() => { setClarify(null); setTimeout(() => ref.current?.focus(), 30); }}>{t('meal.clarify_type')}</Button>
      <Button variant="ghost" className="w-full mt-2" onClick={() => void doSave({ unspecified: true })} data-testid="dont-remember">{t('meal.clarify_skip')}</Button>
    </Sheet>
  );

  return (
    <Sheet open onClose={() => void close(false)} title={existing ? t('meal.edit_title') : t('meal.title')} testid="sheet-meal" headerExtra={<TimestampControl value={ts} onChange={setTs} />}>
      <div className="relative">
        <textarea ref={ref} data-autofocus dir="auto" rows={3} className="w-full rounded-card border border-border bg-surface p-3 pe-12 text-body" placeholder={t('meal.placeholder')}
          value={text} onChange={(e) => setText(e.target.value)} data-testid="meal-text" aria-label={t('meal.title')} />
        {SpeechRec && <button aria-label={t('meal.voice')} aria-pressed={listening} onClick={listen} className={`absolute top-2 end-2 min-h-12 min-w-12 flex items-center justify-center ${listening ? 'text-danger' : 'text-text-muted'}`}><Icon name="symptom" size={20} /></button>}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {photoField && <Chip onClick={() => (photos.length >= maxPhotos ? push({ text: t('meal.photo_limit', { n: maxPhotos }) }) : setPhotoSource(true))} data-testid="meal-photo"><span className="inline-flex items-center gap-1"><Icon name="photo" size={18} />{t('meal.photo')}</span></Chip>}
        <Chip onClick={() => setFavs(true)}><span className="inline-flex items-center gap-1"><Icon name="star" size={18} />{t('meal.favourites')}</span></Chip>
        <Chip onClick={() => void repeatLast()}><span className="inline-flex items-center gap-1"><Icon name="repeat" size={18} />{t('meal.repeat_last')}</span></Chip>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="photo-camera-input" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void addPhotos(f); }} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" data-testid="photo-gallery-input" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void addPhotos(f); }} />
      </div>
      {photos.length > 0 && (reading > 0 || (vision && vision !== 'on')) && <p className="text-label text-text-muted mt-2" data-testid="photo-status">{reading > 0 ? t('meal.photo_reading') : vision === 'off' ? t('meal.photo_vision_off') : t('meal.photo_vision_unavailable')}</p>}
      {photos.length > 0 && <div className="flex gap-2 mt-2 overflow-x-auto" data-testid="meal-photos">{photos.map((p) => (
        <div key={p.id} className="relative shrink-0"><img src={p.url} alt={t('meal.photo')} className="h-20 w-20 object-cover rounded-chip" />
          <button aria-label={t('meal.remove_photo')} className="absolute top-0 end-0 bg-text text-bg rounded-pill h-7 w-7 flex items-center justify-center" onClick={() => removePhoto(p.id)}><Icon name="close" size={14} /></button></div>))}</div>}
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
            <li key={`${i.raw_text}-${n}`} className="flex items-center gap-2 py-1 border-b border-border">
              <button className="flex-1 min-h-12 text-start" onClick={() => setEditing(n)}>
                <span dir="auto" className={`block ${i.food_id && (i.confidence ?? 1) >= 0.6 ? '' : 'underline decoration-dotted'}`}>{i.raw_text}{i.food_id && (i.confidence ?? 1) >= 0.6 ? '' : ' ?'}</span>
                <span dir="auto" className="block text-label text-text-muted">{i.canonical_name ?? t('meal.unresolved')}</span>
              </button>
              <span className="tabular-nums text-label">{i.quantity ?? ''} {i.unit ? t(`units.${i.unit}`) : ''}</span>
              <button aria-label={t('meal.remove_item')} className="min-h-12 min-w-12 text-text-muted" onClick={() => { const prev = items!; setItems(prev.filter((_, k) => k !== n)); push({ text: t('toast.item_removed'), action: { label: t('common.undo'), run: () => setItems(prev) } }); }}><Icon name="close" size={18} /></button>
            </li>
          ))}
        </ul>
        <button className="min-h-12 text-accent" onClick={() => { setItems([...(items ?? []), { raw_text: '', food_id: null, canonical_name: null, quantity: null, unit: null, grams_est: null, confidence: null, resolved_by: 'user' }]); setEditing((items ?? []).length); }}>+ {t('meal.add_item')}</button>
        {parse.addOns.length > 0 && (
          <div className="mt-2"><p className="text-label text-text-muted">{t('meal.invisible_prompt')}</p>
            <div className="flex flex-wrap gap-2 mt-1">{parse.addOns.filter((a) => !(items ?? []).some((i) => i.food_id === a.food_id)).map((a) => <Chip key={a.food_id} onClick={() => setItems([...(items ?? []), { ...a, raw_text: a.label }])}>+ {a.label}</Chip>)}</div>
          </div>
        )}
      </div>
      <Button className="w-full mt-4" onClick={() => void save()} data-testid="save">{existing ? t('common.save_changes') : t('common.save')}</Button>
      {editing !== null && items?.[editing] && (
        <ItemEditor item={items[editing]} onClose={() => setEditing(null)} onChange={async (next) => {
          const copy = [...items]; copy[editing] = next; setItems(copy); setEditing(null);
          const saved = existing?.meal_items?.[editing] as (ParsedItem & { id?: string }) | undefined;
          if (existing && saved?.id) { try { await api(`/meals/${existing.id}/items/${saved.id}`, { method: 'PATCH', body: { food_id: next.food_id, quantity: next.quantity, unit: next.unit, grams_est: next.grams_est, portion_precision: next.portion_precision } }); } catch { /* offline: the edit syncs with the meal */ } }
        }} />
      )}
      <Sheet open={photoSource} onClose={() => setPhotoSource(false)} title={t('meal.photo_source')} testid="photo-source">
        <div className="flex flex-col gap-2">
          <Button onClick={() => pick('camera')} data-testid="photo-camera"><span className="inline-flex items-center gap-2"><Icon name="photo" size={18} />{t('meal.camera')}</span></Button>
          <Button onClick={() => pick('gallery')} data-testid="photo-gallery">{t('meal.gallery')}</Button>
          <p className="text-label text-text-muted">{t('meal.photo_hint', { n: maxPhotos - photos.length })}</p>
          <button className="min-h-12 text-accent" onClick={() => setPhotoSource(false)}>{t('common.cancel')}</button>
        </div>
      </Sheet>
      <Favourites open={favs} onClose={() => setFavs(false)} onPick={(f) => { setText(f.label); setItems(f.items.map((i) => ({ ...i, confidence: 0.95, resolved_by: 'library', portion_precision: 'estimated' }))); setFavs(false); }} />
    </Sheet>
  );
}

interface SpeechRecognitionLike { lang: string; interimResults: boolean; start(): void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void }

/** Item editor (08 §4.3): search library → canonical → "create «text»"; quantity with your own usual portions. */
function ItemEditor({ item, onChange, onClose }: { item: ParsedItem; onChange: (i: ParsedItem) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState(item.raw_text);
  const [res, setRes] = useState<{ id: string; canonical_name: string; in_library: boolean; times_logged: number }[]>([]);
  const [qty, setQty] = useState<number | null>(item.quantity);
  const [unit, setUnit] = useState<string | null>(item.unit);
  const [prec, setPrec] = useState(item.portion_precision ?? 'estimated');
  useEffect(() => { if (q.trim().length < 2) return; const h = setTimeout(() => void api<{ data: typeof res }>(`/foods/search?q=${encodeURIComponent(q)}`).then((r) => setRes(r.data)).catch(() => setRes([])), 250); return () => clearTimeout(h); }, [q]);
  const ratio = item.quantity && item.grams_est && qty ? item.grams_est / item.quantity : null;
  return (
    <Sheet open onClose={onClose} title={t('meal.item_editor')} testid="item-editor">
      <p className="text-label text-text-muted" dir="auto">{t('meal.you_typed')}: {item.raw_text || '—'}</p>
      <input dir="auto" className="w-full min-h-12 rounded-chip border border-border bg-surface px-3 mt-2" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} autoFocus />
      <ul className="mt-2">{res.map((r) => (
        <li key={r.id}><button className="w-full min-h-12 text-start py-2 border-b border-border flex justify-between" onClick={() => onChange({ ...item, raw_text: item.raw_text || q, food_id: r.id, canonical_name: r.canonical_name, confidence: 1, resolved_by: 'user', quantity: qty, unit, grams_est: ratio && qty ? Math.round(ratio * qty) : item.grams_est, portion_precision: prec })}>
          <span dir="auto">{r.canonical_name}</span>{r.in_library && <span className="text-label text-text-muted">{t('meal.in_library', { n: r.times_logged })}</span>}</button></li>))}</ul>
      <div className="flex items-center gap-2 mt-3">
        <input inputMode="decimal" dir="ltr" className="min-h-12 w-20 rounded-chip border border-border bg-surface px-2 text-center" value={qty ?? ''} onChange={(e) => setQty(e.target.value ? Number(e.target.value) : null)} aria-label={t('meal.quantity')} />
        <select className="min-h-12 rounded-chip border border-border bg-surface px-2" value={unit ?? ''} onChange={(e) => setUnit(e.target.value || null)} aria-label={t('meal.unit')}>
          <option value="">—</option>{['unit', 'slice', 'portion', 'tbsp', 'tsp', 'cup', 'bowl', 'g', 'ml'].map((u) => <option key={u} value={u}>{t(`units.${u}`)}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">{(['weighed', 'measured', 'estimated', 'unspecified'] as const).map((p) => <Chip key={p} on={prec === p} onClick={() => setPrec(p)}>{t(`meal.portion_precision.${p}`)}</Chip>)}</div>
      <Button className="w-full mt-4" onClick={() => onChange({ ...item, quantity: qty, unit, grams_est: ratio && qty ? Math.round(ratio * qty) : item.grams_est, portion_precision: prec })}>{t('common.done')}</Button>
    </Sheet>
  );
}

function Favourites({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: { label: string; items: ParsedItem[] }) => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<{ label: string; items: ParsedItem[]; times_logged: number }[] | null>(null);
  useEffect(() => { if (open) void api<{ data: { label: string; items: ParsedItem[]; times_logged: number }[] }>(`/meals/favorites?limit=20&at=${encodeURIComponent(new Date().toISOString())}`).then((r) => setList(r.data)).catch(() => setList([])); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={t('meal.favourites')}>
      {list?.length === 0 && <p className="text-text-muted">{t('meal.no_favourites')}</p>}
      <ul>{list?.map((f) => <li key={f.label}><button dir="auto" className="w-full min-h-12 text-start py-3 border-b border-border" onClick={() => onPick(f)}>{f.label} <span className="text-label text-text-muted">· {t('today.logged_n', { n: f.times_logged })}</span></button></li>)}</ul>
    </Sheet>
  );
}
