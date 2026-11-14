/** Zod schemas shared by api + web (06 §3 "type flow"). */
import { z } from 'zod';

export const SourceSchema = z.enum(['manual', 'photo', 'voice', 'import', 'derived']);
export const TimePrecisionSchema = z.enum(['exact', 'slot_estimate', 'day_only']);
export const TimeSourceSchema = z.enum(['now', 'user_set', 'slot_median', 'default']);
export const SpecificitySchema = z.enum(['resolved', 'partial', 'unspecified']);
export const PortionPrecisionSchema = z.enum(['weighed', 'measured', 'estimated', 'unspecified']);

const valueSchema = z.union([z.number(), z.string(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()])), z.record(z.string(), z.unknown())]);

export const MealItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  raw_text: z.string().min(1).max(500),
  food_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(32).nullable().optional(),
  grams_est: z.number().nonnegative().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  resolved_by: z.enum(['llm', 'user', 'library', 'canonical', 'vision', 'deterministic']).nullable().optional(),
  portion_precision: PortionPrecisionSchema.optional(),
  position: z.number().int().nonnegative().optional(),
});
export type MealItemInput = z.infer<typeof MealItemInputSchema>;

export const ObservationInputSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().min(8).max(100),
  tracker_key: z.string().min(1).max(64),
  occurred_at: z.string().datetime({ offset: true }),
  time_source: TimeSourceSchema.default('now'),
  source: SourceSchema.default('manual'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  values: z.record(z.string(), valueSchema).default({}),
  group_id: z.string().uuid().nullable().optional(),
  batch_id: z.string().uuid().nullable().optional(),
  specificity: SpecificitySchema.optional(),
  meal_items: z.array(MealItemInputSchema).max(40).optional(),
});
export type ObservationInput = z.infer<typeof ObservationInputSchema>;

export const ObservationPatchSchema = ObservationInputSchema.partial().omit({ client_id: true, tracker_key: true }).extend({
  base_revision: z.number().int().positive().optional(),
});
export type ObservationPatch = z.infer<typeof ObservationPatchSchema>;

export const MutationSchema = z.discriminatedUnion('op', [
  z.object({ client_id: z.string().min(8), entity: z.literal('observation'), op: z.literal('upsert'), base_revision: z.number().int().nonnegative().optional(), recorded_at: z.string().datetime({ offset: true }).optional(), payload: ObservationInputSchema }),
  z.object({ client_id: z.string().min(8), entity: z.literal('observation'), op: z.literal('delete'), entity_id: z.string().uuid().optional(), target_client_id: z.string().optional(), recorded_at: z.string().datetime({ offset: true }).optional() }),
]);
export type Mutation = z.infer<typeof MutationSchema>;

export const SyncPushSchema = z.object({
  device_id: z.string().min(3).max(100),
  mutations: z.array(MutationSchema).max(500),
});
export type SyncPush = z.infer<typeof SyncPushSchema>;

export const CredentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(256) });
export const UnlockSchema = z.object({ passphrase: z.string().min(1).max(256) });
export const SetupSchema = z.object({
  passphrase: z.string().min(12).max(256),
  display_name: z.string().max(80).optional(),
  locale: z.enum(['he-IL', 'en-US']).default('he-IL'),
  timezone: z.string().default('Asia/Jerusalem'),
});

export const ProblemSchema = z.object({
  type: z.string(), title: z.string(), status: z.number(), detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), code: z.string(), message: z.string().optional() })).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;

/** Columns allowed in a sync payload, per entity. An explicit allowlist (02 §12.3), never omission. */
export const SYNC_ALLOWLIST = {
  observation: ['id', 'client_id', 'tracker_key', 'def_version', 'def_hash', 'occurred_at', 'local_day', 'recorded_at', 'source', 'confidence',
    'note', 'revision', 'deleted_at', 'group_id', 'batch_id', 'specificity', 'time_precision', 'values', 'meal_items'],
  meal_item: ['id', 'observation_id', 'food_id', 'raw_text', 'quantity', 'unit', 'grams_est', 'confidence', 'resolved_by', 'portion_precision', 'position', 'canonical_name'],
  trial: ['id', 'status', 'design', 'target_kind', 'target_ref', 'target_label', 'primary_outcome', 'phases', 'started_at', 'completed_at', 'revealed_at', 'allocation_sealed'],
  safety_flag: ['id', 'rule_key', 'observation_id', 'raised_at', 'acknowledged_at', 'detail'],
} as const;
/** Keys that must never appear in any sync payload, at any depth. */
export const FORBIDDEN_SYNC_KEYS = ['allocation_key', 'password_hash', 'dek_wrapped', 'object_key_wrapped', 'alias_bidx', 'value_enc'] as const;

export function containsForbiddenKey(payload: unknown): string | null {
  if (Array.isArray(payload)) { for (const x of payload) { const r = containsForbiddenKey(x); if (r) return r; } return null; }
  if (payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload)) {
      if ((FORBIDDEN_SYNC_KEYS as readonly string[]).includes(k)) return k;
      const r = containsForbiddenKey(v); if (r) return r;
    }
  }
  return null;
}

export function pick<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as Partial<T>;
}
