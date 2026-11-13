/**
 * The tracker meta-schema (docs/02-data-model.md §2).
 *
 * A tracker is data, not code. Everything downstream — form rendering, write
 * validation, daily aggregation, outcome/confounder discovery for the engine,
 * safety rules and export — reads these definitions. Rule 1 in CLAUDE.md:
 * never `if (tracker_key === 'stool')`; extend this format instead.
 */
import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export const LOCALES = ['en', 'he'] as const;
export type Locale = (typeof LOCALES)[number];

const localized = z.object({ en: z.string().min(1), he: z.string().min(1) }).strict();
export type LocalizedText = z.infer<typeof localized>;
export const LocalizedTextSchema = localized;

const snake = z.string().regex(/^[a-z][a-z0-9_]*$/, 'must be snake_case');

export const FIELD_TYPES = [
  'scale', 'enum', 'multi_enum', 'number', 'duration', 'text', 'boolean',
  'photo', 'multi_photo', 'time', 'datetime', 'body_map',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const ANALYSIS_ROLES = [
  'outcome', 'exposure', 'exposure_source', 'confounder', 'covariate',
  'context', 'calibration', 'meta', 'outcome_selector', 'ignore',
] as const;

const fieldAnalysis = z.object({
  role: z.enum(ANALYSIS_ROLES),
  direction: z.enum(['higher_is_worse', 'higher_is_better', 'distance_from_center']).optional(),
  center: z.number().optional(),
  normal_range: z.tuple([z.number(), z.number()]).optional(),
  abnormal_high: z.tuple([z.number(), z.number()]).optional(),
  abnormal_low: z.tuple([z.number(), z.number()]).optional(),
  lag_windows_hours: z.array(z.tuple([z.number(), z.number()])).optional(),
  min_observations: z.number().int().positive().optional(),
  shift_cap_pct: z.number().positive().optional(),
}).strict();

const option = z.object({
  value: z.union([z.number(), z.string()]),
  labels: localized,
  illustration: z.string().optional(),
  icon: z.string().optional(),
}).strict();
export type FieldOption = z.infer<typeof option>;

/** Safety rules carried by data. Evaluated on every write (01 US-09 AC1). */
const safety = z.object({
  /** boolean field true → raise */
  flag: z.string().optional(),
  /** enum value → rule key */
  flag_map: z.record(z.string(), z.string()).optional(),
  /** numeric threshold → rule key (e.g. temperature ≥ 38 with GI symptoms) */
  threshold: z.object({ gte: z.number(), rule: z.string(), requires_same_day: z.array(z.string()).optional() }).strict().optional(),
  /** sustained value across consecutive days */
  persistent: z.object({ gte: z.number(), days: z.number().int().positive(), rule: z.string(),
    where: z.object({ field: snake, in: z.array(z.union([z.number(), z.string()])) }).strict().optional() }).strict().optional(),
  /** relative decline over a window, e.g. unintended weight loss ≥ 5% in 90 days */
  decline_pct: z.object({ pct: z.number().positive(), days: z.number().int().positive(), rule: z.string() }).strict().optional(),
}).strict();

const showWhen = z.object({ field: snake, in: z.array(z.union([z.number(), z.string(), z.boolean()])) }).strict();

export const FieldSchema = z.object({
  key: snake,
  type: z.enum(FIELD_TYPES),
  labels: localized,
  help: localized.optional(),
  required: z.boolean().default(false),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  unit: z.string().optional(),
  options: z.array(option).optional(),
  max_length: z.number().int().positive().optional(),
  max_items: z.number().int().positive().optional(),
  default: z.unknown().optional(),
  /** field shown only when another field has one of these values */
  show_when: showWhen.optional(),
  /** narrative-layer fields are encrypted at rest (06 §5.3) */
  sensitive: z.boolean().optional(),
  safety: safety.optional(),
  analysis: fieldAnalysis.optional(),
  /** a field the quick sheet hides behind "more" */
  advanced: z.boolean().optional(),
}).strict().superRefine((f, ctx) => {
  if ((f.type === 'enum' || f.type === 'multi_enum') && (!f.options || f.options.length === 0)) {
    ctx.addIssue({ code: 'custom', message: `${f.type} field needs options` });
  }
  if (f.type === 'scale' && (f.min === undefined || f.max === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'scale field needs min and max' });
  }
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
    ctx.addIssue({ code: 'custom', message: 'min > max' });
  }
});
export type FieldDef = z.infer<typeof FieldSchema>;

export const AGG_OPS = ['count', 'mean', 'max', 'min', 'sum', 'any', 'max_abs_deviation_from',
  'mean_abs_deviation_from', 'mode', 'last'] as const;

const aggAnalysis = z.object({
  role: z.enum(['outcome', 'confounder', 'covariate', 'calibration', 'context']),
  type: z.enum(['binary', 'continuous']),
  direction: z.enum(['higher_is_worse', 'higher_is_better']).default('higher_is_worse'),
  labels: localized,
  /** continuous outcomes also get a binary `<key>_notable` companion (04 §14.2) */
  notable_threshold: z.number().optional(),
  /** confounders whose influence persists (antibiotic within 14 days) */
  persist_days: z.number().int().nonnegative().optional(),
  /** normaliser for 0..1 scaling (e.g. 3 for |bristol-4|) */
  scale_max: z.number().positive().optional(),
  /** contributes to the gut-day score with this weight key */
  score_component: z.string().optional(),
  /** in the default confounder set for adjustment */
  adjust: z.boolean().optional(),
}).strict();

export const AggregationSchema = z.object({
  key: snake,
  op: z.enum(AGG_OPS),
  field: snake.optional(),
  /** filter observations before aggregating */
  where: z.object({ field: snake, in: z.array(z.union([z.number(), z.string(), z.boolean()])) }).strict().optional(),
  /** for `any`: value membership or comparison */
  in: z.array(z.union([z.number(), z.string(), z.boolean()])).optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  center: z.number().optional(),
  /** scale factor applied to the result (e.g. normalise to 0..100) */
  scale: z.number().optional(),
  analysis: aggAnalysis.optional(),
}).strict().superRefine((a, ctx) => {
  if (a.op !== 'count' && !a.field) ctx.addIssue({ code: 'custom', message: `op ${a.op} needs a field` });
  if ((a.op === 'max_abs_deviation_from' || a.op === 'mean_abs_deviation_from') && a.center === undefined) {
    ctx.addIssue({ code: 'custom', message: `op ${a.op} needs center` });
  }
});
export type AggregationDef = z.infer<typeof AggregationSchema>;

export const TrackerDefinitionSchema = z.object({
  $schema: z.string().optional(),
  key: snake,
  version: z.number().int().positive(),
  category: z.enum(['gut', 'meal', 'wellbeing', 'body', 'intake', 'activity', 'context', 'calibration', 'custom']),
  icon: z.string(),
  cardinality: z.enum(['one_per_day', 'many_per_day', 'occasional']),
  /** observations of this tracker count as an outcome record for w(d) (04 §2) */
  counts_as_outcome_record: z.boolean().optional(),
  /** this tracker is the evening check-in for w(d) */
  counts_as_checkin: z.boolean().optional(),
  /** meals: carries meal_items and is an exposure source */
  has_meal_items: z.boolean().optional(),
  /** one save may record several observations, one per value of this field (symptoms) */
  group_by_field: snake.optional(),
  /** the explicit "nothing to report" answer, worth as much to the engine as a symptom report (05 §4.4) */
  all_clear: z.object({ field: snake, value: z.union([z.boolean(), z.string(), z.number()]) }).strict().optional(),
  quick_log: z.object({
    enabled: z.boolean(),
    primary_field: snake.optional(),
    home_shortcut: z.boolean().optional(),
  }).strict().optional(),
  labels: z.object({
    en: z.object({ name: z.string().min(1), short: z.string().min(1) }).strict(),
    he: z.object({ name: z.string().min(1), short: z.string().min(1) }).strict(),
  }).strict(),
  fields: z.array(FieldSchema).min(1),
  aggregation: z.object({ daily: z.array(AggregationSchema) }).strict().optional(),
  charts: z.array(z.object({
    type: z.enum(['distribution', 'timeline_band', 'line', 'bar']),
    field: snake.optional(),
    aggregation: snake.optional(),
    bins: z.number().int().optional(),
    good_range: z.tuple([z.number(), z.number()]).optional(),
  }).strict()).optional(),
}).strict().superRefine((t, ctx) => {
  const keys = new Set<string>();
  for (const f of t.fields) {
    if (keys.has(f.key)) ctx.addIssue({ code: 'custom', path: ['fields'], message: `duplicate field key '${f.key}'` });
    keys.add(f.key);
  }
  for (const f of t.fields) {
    if (f.show_when && !keys.has(f.show_when.field)) {
      ctx.addIssue({ code: 'custom', path: ['fields', f.key, 'show_when'], message: `unknown field '${f.show_when.field}'` });
    }
  }
  if (t.quick_log?.primary_field && !keys.has(t.quick_log.primary_field)) {
    ctx.addIssue({ code: 'custom', path: ['quick_log', 'primary_field'], message: `unknown field '${t.quick_log.primary_field}'` });
  }
  if (t.all_clear && !keys.has(t.all_clear.field)) {
    ctx.addIssue({ code: 'custom', path: ['all_clear'], message: `unknown field '${t.all_clear.field}'` });
  }
  if (t.group_by_field && !keys.has(t.group_by_field)) {
    ctx.addIssue({ code: 'custom', path: ['group_by_field'], message: `unknown field '${t.group_by_field}'` });
  }
  const aggKeys = new Set<string>();
  for (const a of t.aggregation?.daily ?? []) {
    if (aggKeys.has(a.key)) ctx.addIssue({ code: 'custom', path: ['aggregation'], message: `duplicate aggregation '${a.key}'` });
    aggKeys.add(a.key);
    if (a.field && !keys.has(a.field)) {
      ctx.addIssue({ code: 'custom', path: ['aggregation', a.key], message: `unknown field '${a.field}'` });
    }
    if (a.where && !keys.has(a.where.field)) {
      ctx.addIssue({ code: 'custom', path: ['aggregation', a.key, 'where'], message: `unknown field '${a.where.field}'` });
    }
  }
});
export type TrackerDefinition = z.infer<typeof TrackerDefinitionSchema>;

export const PackSchema = z.object({
  key: snake,
  labels: localized,
  description: localized,
  trackers: z.array(snake).min(1),
  default_enabled: z.boolean().default(false),
}).strict();
export type Pack = z.infer<typeof PackSchema>;

/** Stable JSON: keys sorted, so the hash is independent of formatting. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && k !== '$schema')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(def: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(def)))).slice(0, 16);
}

export class TrackerDefinitionError extends Error {
  constructor(public readonly source: string, public readonly issues: string[]) {
    super(`Invalid tracker definition ${source}:\n  - ${issues.join('\n  - ')}`);
    this.name = 'TrackerDefinitionError';
  }
}

export function formatZodIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
}

export function parseTrackerDefinition(raw: unknown, source = '(inline)'): TrackerDefinition {
  const res = TrackerDefinitionSchema.safeParse(raw);
  if (!res.success) throw new TrackerDefinitionError(source, formatZodIssues(res.error));
  return res.data;
}

export * from './values.js';
