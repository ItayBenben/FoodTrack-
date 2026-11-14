'use client';
/** Renders any field from its definition (02 §2.1). There is no hard-coded form anywhere. */
import { useState } from 'react';
import type { FieldDef } from '@foodtrack/tracker-schema';
import { useI18n } from '@/lib/i18n';
import { BristolArt } from './icons';
import { Chip, SegmentedScale } from './ui';

export function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const { label, t, locale } = useI18n();
  const name = label(field.labels);
  const id = `f-${field.key}`;
  switch (field.type) {
    case 'scale':
      return <Labeled name={name} id={id}><SegmentedScale min={field.min!} max={field.max!} value={value as number | null} onChange={onChange} label={name} lowHint={t('fields.low')} highHint={t('fields.high')} /></Labeled>;
    case 'enum': {
      const illustrated = field.options?.some((o) => o.illustration);
      if (illustrated) return <Labeled name={name} id={id}><TileGrid field={field} value={value} onPick={onChange} /></Labeled>;
      return (
        <Labeled name={name} id={id}><div className="flex flex-wrap gap-2">
          {field.options!.map((o) => <Chip key={String(o.value)} on={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)}>{label(o.labels)}</Chip>)}
        </div></Labeled>
      );
    }
    case 'multi_enum': {
      const arr = Array.isArray(value) ? (value as (string | number)[]) : [];
      return (
        <Labeled name={name} id={id}><div className="flex flex-wrap gap-2">
          {field.options!.map((o) => { const on = arr.includes(o.value); return <Chip key={String(o.value)} on={on} onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>{label(o.labels)}</Chip>; })}
        </div></Labeled>
      );
    }
    case 'boolean':
      return <Chip on={value === true} onClick={() => onChange(value === true ? null : true)}>{name}</Chip>;
    case 'number':
      return (
        <Labeled name={name} id={id}>
          <div className="flex items-center gap-2">
            <button className="min-h-12 min-w-12 rounded-chip border border-border bg-surface text-title" aria-label={t('fields.decrease')} onClick={() => onChange(round((Number(value ?? field.default ?? field.min ?? 0)) - (field.step ?? 1), field.step))}>−</button>
            <input id={id} inputMode="decimal" dir="ltr" className="min-h-12 w-28 text-center rounded-chip border border-border bg-surface tabular-nums" value={value === undefined || value === null ? '' : String(value)}
              onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); onChange(e.target.value === '' ? null : Number.isFinite(n) ? n : value); }} />
            <button className="min-h-12 min-w-12 rounded-chip border border-border bg-surface text-title" aria-label={t('fields.increase')} onClick={() => onChange(round((Number(value ?? field.default ?? field.min ?? 0)) + (field.step ?? 1), field.step))}>+</button>
            {field.unit && <span className="text-text-muted">{field.unit}</span>}
          </div>
        </Labeled>
      );
    case 'duration': {
      const mins = typeof value === 'number' ? Math.round(value / 60) : '';
      return <Labeled name={name} id={id}><div className="flex items-center gap-2"><input id={id} inputMode="numeric" dir="ltr" className="min-h-12 w-24 text-center rounded-chip border border-border bg-surface" value={mins} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value) * 60)} /><span className="text-text-muted">{t('fields.minutes')}</span></div></Labeled>;
    }
    case 'text':
      return <Labeled name={name} id={id}><textarea id={id} dir="auto" rows={field.max_length && field.max_length > 200 ? 3 : 1} maxLength={field.max_length} className="w-full min-h-12 rounded-chip border border-border bg-surface p-3 text-body" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} /></Labeled>;
    case 'datetime':
      return <Labeled name={name} id={id}><input id={id} type="datetime-local" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-3" value={value ? toLocalInput(String(value)) : ''} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} /></Labeled>;
    case 'time':
      return <Labeled name={name} id={id}><input id={id} type="time" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-3" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} /></Labeled>;
    case 'body_map':
      return <Labeled name={name} id={id}><BodyMap value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} /></Labeled>;
    default:
      return <p className="text-text-muted text-label">{t('fields.unsupported', { type: field.type, locale })}</p>;
  }
}

function round(n: number, step?: number) { const s = step ?? 1; return Math.round(n / s) * s; }
function toLocalInput(iso: string) { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

function Labeled({ name, id, children }: { name: string; id: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 my-3"><label htmlFor={id} className="text-label font-medium text-text-muted">{name}</label>{children}</div>;
}

export function TileGrid({ field, value, onPick }: { field: FieldDef; value: unknown; onPick: (v: unknown) => void }) {
  const { label } = useI18n();
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={label(field.labels)}>
      {field.options!.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={value === o.value} data-testid={`tile-${field.key}-${o.value}`} onClick={() => onPick(o.value)}
          className={`flex flex-col items-center justify-center gap-1 min-h-20 rounded-card border p-2 ${value === o.value ? 'bg-accent-soft border-accent' : 'bg-surface border-border'}`}>
          {o.illustration?.startsWith('bristol-') ? <BristolArt type={Number(o.value)} /> : null}
          <span className="text-title font-semibold tabular-nums">{String(o.value)}</span>
          <span className="text-label text-text-muted text-center leading-tight">{label(o.labels)}</span>
        </button>
      ))}
    </div>
  );
}

const REGIONS = ['upper_start', 'upper_mid', 'upper_end', 'mid_start', 'navel', 'mid_end', 'lower_start', 'lower_mid', 'lower_end'];
export function BodyMap({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-1 w-48" role="group" aria-label={t('fields.body_map')}>
      {REGIONS.map((r) => { const on = value.includes(r); return (
        <button key={r} aria-pressed={on} aria-label={t(`fields.region.${r}`)} onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
          className={`h-14 rounded-chip border ${on ? 'bg-accent border-accent' : 'bg-surface border-border'}`} />); })}
    </div>
  );
}

/** One timestamp control on every capture screen (08 §1.4). */
export function TimestampControl({ value, onChange, rolloverNote }: { value: string | null; onChange: (iso: string | null) => void; rolloverNote?: string | null }) {
  const { t, fmtTime } = useI18n();
  const [open, setOpen] = useState(false);
  const shown = value ?? new Date().toISOString();
  const days = Array.from({ length: 8 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (7 - i)); return d; });
  const cur = new Date(shown);
  const setDay = (d: Date) => { const n = new Date(cur); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); onChange(n.toISOString()); };
  return (
    <div>
      <button className="min-h-12 px-3 rounded-pill bg-surface-sunken text-text tabular-nums" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="timestamp">
        {value ? `${cur.toDateString() === new Date().toDateString() ? t('time.today') : cur.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${fmtTime(shown)}` : `${t('time.now')} · ${fmtTime(shown)}`} ▾
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-card bg-surface border border-border">
          <div className="flex gap-1 overflow-x-auto">
            {days.map((d) => <Chip key={d.toISOString()} on={d.toDateString() === cur.toDateString()} onClick={() => setDay(d)}>{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</Chip>)}
          </div>
          <input type="time" dir="ltr" className="mt-2 min-h-12 rounded-chip border border-border bg-surface px-3" value={`${String(cur.getHours()).padStart(2, '0')}:${String(cur.getMinutes()).padStart(2, '0')}`}
            onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); const n = new Date(cur); n.setHours(h ?? 0, m ?? 0, 0, 0); if (n.getTime() > Date.now() + 24 * 3600_000) return; onChange(n.toISOString()); }} />
          {rolloverNote && <p className="text-label text-text-muted mt-2">{rolloverNote}</p>}
          <div className="mt-2 flex gap-2"><button className="min-h-12 px-3 text-accent" onClick={() => { onChange(null); setOpen(false); }}>{t('time.now')}</button><button className="min-h-12 px-3 font-semibold text-accent" onClick={() => setOpen(false)}>{t('time.set')}</button></div>
        </div>
      )}
    </div>
  );
}
