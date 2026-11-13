/**
 * Definition-driven validation and aggregation of observation values.
 * Used by the API write path and by the client before it writes to Dexie,
 * so both reject exactly the same things.
 */
import type { AggregationDef, FieldDef, TrackerDefinition } from './index.js';

export type ObservationValue = number | string | boolean | null | string[] | number[] | Record<string, unknown>;
export type ObservationValues = Record<string, ObservationValue | undefined>;

export interface ValueIssue { path: string; code: string; message: string }

function isNum(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }

export function visibleFields(def: TrackerDefinition, values: ObservationValues): FieldDef[] {
  return def.fields.filter((f) => {
    if (!f.show_when) return true;
    const v = values[f.show_when.field];
    return f.show_when.in.some((x) => x === v);
  });
}

export function validateValues(def: TrackerDefinition, values: ObservationValues): ValueIssue[] {
  const issues: ValueIssue[] = [];
  const known = new Map(def.fields.map((f) => [f.key, f]));
  for (const k of Object.keys(values)) {
    if (!known.has(k)) issues.push({ path: `values.${k}`, code: 'unknown_field', message: `field '${k}' is not defined for tracker '${def.key}'` });
  }
  const visible = new Set(visibleFields(def, values).map((f) => f.key));
  for (const f of def.fields) {
    const v = values[f.key];
    const path = `values.${f.key}`;
    if (v === undefined || v === null || v === '') {
      if (f.required && visible.has(f.key)) issues.push({ path, code: 'required', message: `field '${f.key}' is required for tracker '${def.key}'` });
      continue;
    }
    switch (f.type) {
      case 'scale':
      case 'number':
      case 'duration': {
        if (!isNum(v)) { issues.push({ path, code: 'type', message: `'${f.key}' must be a number` }); break; }
        if (f.min !== undefined && v < f.min) issues.push({ path, code: 'min', message: `'${f.key}' must be ≥ ${f.min}` });
        if (f.max !== undefined && v > f.max) issues.push({ path, code: 'max', message: `'${f.key}' must be ≤ ${f.max}` });
        if (f.type === 'scale' && !Number.isInteger(v / (f.step ?? 1))) issues.push({ path, code: 'step', message: `'${f.key}' must be a step of ${f.step ?? 1}` });
        break;
      }
      case 'enum': {
        if (!f.options?.some((o) => o.value === v)) issues.push({ path, code: 'option', message: `'${String(v)}' is not an option of '${f.key}'` });
        break;
      }
      case 'multi_enum': {
        if (!Array.isArray(v)) { issues.push({ path, code: 'type', message: `'${f.key}' must be an array` }); break; }
        for (const x of v) if (!f.options?.some((o) => o.value === x)) issues.push({ path, code: 'option', message: `'${String(x)}' is not an option of '${f.key}'` });
        break;
      }
      case 'boolean':
        if (typeof v !== 'boolean') issues.push({ path, code: 'type', message: `'${f.key}' must be true or false` });
        break;
      case 'text':
        if (typeof v !== 'string') issues.push({ path, code: 'type', message: `'${f.key}' must be text` });
        else if (f.max_length && v.length > f.max_length) issues.push({ path, code: 'max_length', message: `'${f.key}' is longer than ${f.max_length}` });
        break;
      case 'time':
        if (typeof v !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(v)) issues.push({ path, code: 'type', message: `'${f.key}' must be HH:MM` });
        break;
      case 'datetime':
        if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) issues.push({ path, code: 'type', message: `'${f.key}' must be an RFC 3339 timestamp` });
        break;
      case 'photo':
        if (typeof v !== 'string') issues.push({ path, code: 'type', message: `'${f.key}' must be a media id` });
        break;
      case 'multi_photo':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) issues.push({ path, code: 'type', message: `'${f.key}' must be an array of media ids` });
        else if (f.max_items && v.length > f.max_items) issues.push({ path, code: 'max_items', message: `'${f.key}' allows at most ${f.max_items}` });
        break;
      case 'body_map':
        if (!Array.isArray(v)) issues.push({ path, code: 'type', message: `'${f.key}' must be an array of regions` });
        break;
    }
  }
  return issues;
}

/** Storage column for a field type (02 §2.1). */
export function storageColumn(f: FieldDef, v: ObservationValue): 'value_num' | 'value_text' | 'value_bool' | 'value_ts' | 'value_json' {
  switch (f.type) {
    case 'scale': case 'number': case 'duration': return 'value_num';
    case 'enum': return typeof v === 'number' ? 'value_num' : 'value_text';
    case 'boolean': return 'value_bool';
    case 'datetime': return 'value_ts';
    case 'text': case 'time': case 'photo': return 'value_text';
    default: return 'value_json';
  }
}

export interface DayObservation { values: ObservationValues }

function matches(a: AggregationDef, o: DayObservation): boolean {
  if (!a.where) return true;
  const v = o.values[a.where.field];
  return a.where.in.some((x) => x === v);
}

/** Compute one daily aggregation over a day's observations of a tracker. null = no data. */
export function aggregateDay(a: AggregationDef, obs: DayObservation[]): number | boolean | null {
  const rows = obs.filter((o) => matches(a, o));
  if (a.op === 'count') return rows.length;
  const vals = rows.map((o) => (a.field ? o.values[a.field] : undefined)).filter((v) => v !== undefined && v !== null);
  if (vals.length === 0) return a.op === 'any' ? null : null;
  const nums = vals.filter(isNum) as number[];
  const scale = a.scale ?? 1;
  switch (a.op) {
    case 'mean': return nums.length ? (nums.reduce((s, x) => s + x, 0) / nums.length) * scale : null;
    case 'max': return nums.length ? Math.max(...nums) * scale : null;
    case 'min': return nums.length ? Math.min(...nums) * scale : null;
    case 'sum': return nums.reduce((s, x) => s + x, 0) * scale;
    case 'last': return nums.length ? nums[nums.length - 1]! * scale : null;
    case 'max_abs_deviation_from': return nums.length ? Math.max(...nums.map((x) => Math.abs(x - a.center!))) * scale : null;
    case 'mean_abs_deviation_from': return nums.length ? (nums.reduce((s, x) => s + Math.abs(x - a.center!), 0) / nums.length) * scale : null;
    case 'mode': {
      const counts = new Map<number, number>();
      for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
      let best: number | null = null; let bc = 0;
      for (const [k, c] of counts) if (c > bc) { best = k; bc = c; }
      return best;
    }
    case 'any': return vals.some((v) => {
      if (a.in) return a.in.some((x) => x === v);
      if (a.gte !== undefined) return isNum(v) && v >= a.gte;
      if (a.lt !== undefined) return isNum(v) && v < a.lt;
      return v === true;
    });
  }
  return null;
}

export function aggregateTrackerDay(def: TrackerDefinition, obs: DayObservation[]): Record<string, number | boolean | null> {
  const out: Record<string, number | boolean | null> = {};
  for (const a of def.aggregation?.daily ?? []) out[a.key] = aggregateDay(a, obs);
  return out;
}

/** Every outcome the registry declares, as dotted refs (02 §3: `tracker.aggregation_key`). */
export function listOutcomes(defs: TrackerDefinition[]) {
  const out: { ref: string; tracker: string; agg: AggregationDef; type: 'binary' | 'continuous'; labels: { en: string; he: string } }[] = [];
  for (const d of defs) for (const a of d.aggregation?.daily ?? []) {
    if (a.analysis?.role !== 'outcome') continue;
    out.push({ ref: `${d.key}.${a.key}`, tracker: d.key, agg: a, type: a.analysis.type, labels: a.analysis.labels });
    if (a.analysis.type === 'continuous' && a.analysis.notable_threshold !== undefined) {
      out.push({ ref: `${d.key}.${a.key}_notable`, tracker: d.key, agg: a, type: 'binary',
        labels: { en: `${a.analysis.labels.en} ≥ ${a.analysis.notable_threshold}`, he: `${a.analysis.labels.he} ≥ ${a.analysis.notable_threshold}` } });
    }
  }
  return out;
}
