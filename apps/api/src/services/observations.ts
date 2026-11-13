/**
 * The observation write path. Validation is definition-driven; local_day and
 * time_precision are always derived server-side; narrative fields are sealed
 * before they reach Postgres; every write lands in change_log for pull sync.
 */
import type { TrackerDefinition } from '@foodtrack/tracker-schema';
import { validateValues, storageColumn, type ObservationValues } from '@foodtrack/tracker-schema';
import { localDay, uuidv7, type ObservationInput, type MealItemInput, SYNC_ALLOWLIST, pick } from '@foodtrack/shared';
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { HttpProblem, notFound, validation } from '../lib/problem.js';
import { getUser } from './users.js';
import { evaluateSafety, type RaisedFlag } from './safety.js';

export interface WriteCtx { deps: Deps; deviceId: string | null; changedBy?: string }

export interface ObservationPayload {
  id: string; client_id: string | null; tracker_key: string; def_version: number; def_hash: string;
  occurred_at: string; local_day: string; recorded_at: string; source: string; confidence: number | null;
  note: string | null; revision: number; deleted_at: string | null; group_id: string | null; batch_id: string | null;
  specificity: string; time_precision: string; parse_status: string;
  values: Record<string, unknown>; meal_items?: MealItemPayload[];
}
export interface MealItemPayload {
  id: string; observation_id: string; food_id: string | null; canonical_name: string | null; raw_text: string;
  quantity: number | null; unit: string | null; grams_est: number | null; confidence: number | null;
  resolved_by: string | null; portion_precision: string; position: number;
}

/** Hooks run inside the write transaction after an observation is stored (trial exposure detection, M5). */
export type PostWriteHook = (tx: Tx, ctx: WriteCtx, obs: ObservationPayload, def: TrackerDefinition) => Promise<void>;
export const postWriteHooks: PostWriteHook[] = [];

// ───────────── derivations ─────────────
export function deriveTimePrecision(timeSource: string, occurredAt: Date, recordedAt: Date, exactDelayH: number): 'exact' | 'slot_estimate' | 'day_only' {
  if (timeSource === 'user_set') return 'exact';
  if (timeSource === 'slot_median') return 'slot_estimate';
  if (timeSource === 'default') return 'day_only';
  return Math.abs(occurredAt.getTime() - recordedAt.getTime()) <= exactDelayH * 3600_000 ? 'exact' : 'day_only';
}

export function deriveSpecificity(items: { food_id?: string | null; confidence?: number | null }[], hasContent: boolean): 'resolved' | 'partial' | 'unspecified' {
  if (items.length === 0) return hasContent ? 'partial' : 'unspecified';
  const resolved = items.filter((i) => i.food_id && (i.confidence ?? 1) >= 0.6).length;
  if (resolved === 0) return hasContent ? 'partial' : 'unspecified';
  return resolved === items.length ? 'resolved' : 'partial';
}

// ───────────── reading ─────────────
interface ObsRow {
  id: string; client_id: string | null; tracker_key: string; def_version: number; def_hash: string; occurred_at: Date; local_day: string;
  recorded_at: Date; source: string; confidence: number | null; note: Buffer | null; revision: number; deleted_at: Date | null;
  group_id: string | null; batch_id: string | null; specificity: string; time_precision: string; parse_status: string;
}
const OBS_COLS = `id, client_id, tracker_key, def_version, def_hash, occurred_at, local_day, recorded_at, source, confidence, note,
  revision, deleted_at, group_id, batch_id, specificity, time_precision, parse_status`;

export async function readValues(tx: Tx, deps: Deps, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>(ids.map((i) => [i, {}]));
  if (!ids.length) return out;
  const { rows } = await tx.query<{ observation_id: string; field_key: string; value_num: number | null; value_text: string | null; value_enc: Buffer | null;
    value_bool: boolean | null; value_ts: Date | null; value_json: unknown; value_media_id: string | null }>(
    `SELECT observation_id, field_key, value_num, value_text, value_enc, value_bool, value_ts, value_json, value_media_id
     FROM observation_value WHERE observation_id = ANY($1::uuid[])`, [ids]);
  for (const r of rows) {
    const v = r.value_num ?? r.value_text ?? (r.value_enc ? deps.keys.crypto.open('observation_value', r.field_key, r.observation_id, r.value_enc) : null)
      ?? r.value_bool ?? (r.value_ts ? r.value_ts.toISOString() : null) ?? r.value_json ?? r.value_media_id;
    out.get(r.observation_id)![r.field_key] = v;
  }
  return out;
}

export async function readMealItems(tx: Tx, deps: Deps, ids: string[]): Promise<Map<string, MealItemPayload[]>> {
  const out = new Map<string, MealItemPayload[]>(ids.map((i) => [i, []]));
  if (!ids.length) return out;
  const { rows } = await tx.query<Omit<MealItemPayload, 'raw_text'> & { raw_text: Buffer }>(
    `SELECT mi.id, mi.observation_id, mi.food_id, f.canonical_name, mi.raw_text, mi.quantity, mi.unit, mi.grams_est, mi.confidence,
            mi.resolved_by, mi.portion_precision, mi.position
     FROM meal_item mi LEFT JOIN food f ON f.id = mi.food_id WHERE mi.observation_id = ANY($1::uuid[]) ORDER BY mi.position`, [ids]);
  for (const r of rows) out.get(r.observation_id)!.push({ ...r, raw_text: deps.keys.crypto.open('meal_item', 'raw_text', r.id, r.raw_text) ?? '' });
  return out;
}

function toPayload(deps: Deps, r: ObsRow, values: Record<string, unknown>, items?: MealItemPayload[]): ObservationPayload {
  return {
    id: r.id, client_id: r.client_id, tracker_key: r.tracker_key, def_version: r.def_version, def_hash: r.def_hash,
    occurred_at: r.occurred_at.toISOString(), local_day: r.local_day, recorded_at: r.recorded_at.toISOString(), source: r.source,
    confidence: r.confidence, note: deps.keys.crypto.open('observation', 'note', r.id, r.note), revision: r.revision,
    deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null, group_id: r.group_id, batch_id: r.batch_id,
    specificity: r.specificity, time_precision: r.time_precision, parse_status: r.parse_status, values,
    ...(items ? { meal_items: items } : {}),
  };
}

export async function loadObservations(tx: Tx, deps: Deps, where: string, params: unknown[]): Promise<ObservationPayload[]> {
  const { rows } = await tx.query<ObsRow>(`SELECT ${OBS_COLS} FROM observation WHERE ${where}`, params);
  const ids = rows.map((r) => r.id);
  const [values, items] = await Promise.all([readValues(tx, deps, ids), readMealItems(tx, deps, ids)]);
  return rows.map((r) => toPayload(deps, r, values.get(r.id) ?? {}, items.get(r.id)?.length || r.tracker_key === 'meal' ? items.get(r.id) : undefined));
}

export async function loadObservation(tx: Tx, deps: Deps, id: string): Promise<ObservationPayload | null> {
  return (await loadObservations(tx, deps, 'id = $1', [id]))[0] ?? null;
}

// ───────────── change log ─────────────
/** Narrative fields are sealed in the change log (I-13); /sync/pull opens them. */
function sealForLog(deps: Deps, p: ObservationPayload) {
  const body = pick(p as unknown as Record<string, unknown>, SYNC_ALLOWLIST.observation) as Record<string, unknown>;
  return { ...body, note: undefined, note_sealed: p.note ? deps.keys.crypto.seal('change_log', 'note', p.id, p.note).toString('base64') : null,
    values: undefined, values_sealed: deps.keys.crypto.seal('change_log', 'values', p.id, JSON.stringify(p.values)).toString('base64'),
    meal_items: undefined, meal_items_sealed: p.meal_items ? deps.keys.crypto.seal('change_log', 'meal_items', p.id, JSON.stringify(p.meal_items)).toString('base64') : null };
}
export function openFromLog(deps: Deps, entityId: string, payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  const open = (col: string, k: string) => {
    const s = payload[k] as string | null | undefined;
    delete out[k];
    return s ? deps.keys.crypto.open('change_log', col, entityId, Buffer.from(s, 'base64')) : null;
  };
  out.note = open('note', 'note_sealed');
  const v = open('values', 'values_sealed'); out.values = v ? JSON.parse(v) : {};
  const mi = open('meal_items', 'meal_items_sealed'); if (mi) out.meal_items = JSON.parse(mi);
  return out;
}

export async function logChange(tx: Tx, ctx: WriteCtx, p: ObservationPayload, op: 'upsert' | 'delete') {
  await tx.query(`INSERT INTO change_log (user_id, entity, entity_id, op, payload, device_id) VALUES (app_current_user(), 'observation', $1, $2, $3, $4)`,
    [p.id, op, sealForLog(ctx.deps, p), ctx.deviceId]);
}

async function snapshot(tx: Tx, ctx: WriteCtx, p: ObservationPayload, reason: string) {
  const sealed = ctx.deps.keys.crypto.seal('observation_revision', 'snapshot', p.id, JSON.stringify(p)).toString('base64');
  await tx.query(`INSERT INTO observation_revision (observation_id, user_id, revision, snapshot, changed_by, reason) VALUES ($1, app_current_user(), $2, $3, $4, $5)`,
    [p.id, p.revision, { sealed }, ctx.changedBy ?? ctx.deviceId ?? 'server', reason]);
}

export async function revisions(tx: Tx, deps: Deps, id: string) {
  const { rows } = await tx.query<{ revision: number; snapshot: { sealed: string }; changed_at: Date; changed_by: string; reason: string | null }>(
    'SELECT revision, snapshot, changed_at, changed_by, reason FROM observation_revision WHERE observation_id = $1 ORDER BY changed_at', [id]);
  return rows.map((r) => ({ ...r, snapshot: JSON.parse(deps.keys.crypto.open('observation_revision', 'snapshot', id, Buffer.from(r.snapshot.sealed, 'base64'))!) }));
}

// ───────────── writing ─────────────
async function writeValues(tx: Tx, deps: Deps, def: TrackerDefinition, id: string, values: ObservationValues) {
  await tx.query('DELETE FROM observation_value WHERE observation_id = $1', [id]);
  for (const f of def.fields) {
    const v = values[f.key];
    if (v === undefined || v === null || v === '') continue;
    const col = f.type === 'text' && f.sensitive ? 'value_enc' : storageColumn(f, v);
    const stored = col === 'value_enc' ? deps.keys.crypto.seal('observation_value', f.key, id, String(v))
      : col === 'value_json' ? JSON.stringify(v) : v;
    await tx.query(`INSERT INTO observation_value (observation_id, user_id, field_key, ${col}, unit) VALUES ($1, app_current_user(), $2, $3, $4)`,
      [id, f.key, stored, f.unit ?? null]);
  }
}

export async function writeMealItems(tx: Tx, deps: Deps, observationId: string, items: MealItemInput[], occurredAt: Date) {
  await tx.query('DELETE FROM meal_item WHERE observation_id = $1', [observationId]);
  let pos = 0;
  for (const it of items) {
    const id = it.id ?? uuidv7();
    const grams = it.grams_est ?? null;
    await tx.query(
      `INSERT INTO meal_item (id, observation_id, user_id, food_id, raw_text, quantity, unit, grams_est, estimated, confidence, resolved_by, portion_precision, position)
       VALUES ($1,$2,app_current_user(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, observationId, it.food_id ?? null, deps.keys.crypto.seal('meal_item', 'raw_text', id, it.raw_text), it.quantity ?? null, it.unit ?? null,
        grams, grams === null, it.confidence ?? null, it.resolved_by ?? null,
        it.portion_precision ?? (it.quantity ? 'estimated' : 'unspecified'), it.position ?? pos++]);
    if (it.food_id) await learnFood(tx, deps, it.food_id, it.raw_text, it.quantity ?? null, it.unit ?? null, grams, occurredAt);
  }
}

/** The personal library learns from every resolved item (03 §5 stage 2, §13.3). */
export async function learnFood(tx: Tx, deps: Deps, foodId: string, alias: string, qty: number | null, unit: string | null, grams: number | null, at: Date) {
  const bidx = deps.keys.crypto.blindIndex(alias);
  const sealedAlias = deps.keys.crypto.seal('user_food', 'alias', foodId, alias);
  await tx.query(
    `INSERT INTO user_food (user_id, food_id, alias, alias_bidx, median_qty, median_unit, median_grams, qty_history, times_logged, last_logged)
     VALUES (app_current_user(), $1, $2, $3, $4, $5, $6, CASE WHEN $6::numeric IS NULL THEN '{}' ELSE ARRAY[$6::numeric] END, 1, $7)
     ON CONFLICT (user_id, food_id) DO UPDATE SET
       times_logged = user_food.times_logged + 1,
       last_logged = greatest(user_food.last_logged, EXCLUDED.last_logged),
       qty_history = CASE WHEN $6::numeric IS NULL THEN user_food.qty_history ELSE (user_food.qty_history || $6::numeric)[greatest(1, cardinality(user_food.qty_history) - 18):] END,
       median_unit = coalesce(EXCLUDED.median_unit, user_food.median_unit)`,
    [foodId, sealedAlias, bidx, qty, unit, grams, at]);
  await tx.query(
    `UPDATE user_food SET median_grams = (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x) FROM unnest(qty_history) x),
       median_qty = CASE WHEN $2::numeric IS NOT NULL THEN coalesce($2::numeric, median_qty) ELSE median_qty END
     WHERE food_id = $1`, [foodId, qty]);
  const aliasKey = deps.keys.crypto.seal('user_food_alias', 'alias', foodId, alias);
  await tx.query(`INSERT INTO user_food_alias (user_id, alias_bidx, alias, food_id) VALUES (app_current_user(), $1, $2, $3)
                  ON CONFLICT (user_id, alias_bidx) DO UPDATE SET food_id = EXCLUDED.food_id`, [bidx, aliasKey, foodId]);
}

export interface CreateResult { observation: ObservationPayload; created: boolean; safety_flags: RaisedFlag[] }

export async function createObservation(tx: Tx, ctx: WriteCtx, input: ObservationInput): Promise<CreateResult> {
  const { deps } = ctx;
  const existing = await tx.query<{ id: string }>('SELECT id FROM observation WHERE client_id = $1', [input.client_id]);
  if (existing.rows[0]) {
    return { observation: (await loadObservation(tx, deps, existing.rows[0].id))!, created: false, safety_flags: [] };
  }
  const reg = await deps.registry.get(tx, input.tracker_key);
  if (!reg) throw validation(`Unknown tracker '${input.tracker_key}'`, [{ path: 'tracker_key', code: 'unknown', message: `tracker '${input.tracker_key}' is not registered` }]);
  const def = reg.def;
  const issues = validateValues(def, input.values as ObservationValues);
  if (issues.length) throw validation(`Invalid observation`, issues);
  if (input.meal_items?.length && !def.has_meal_items) throw validation('Invalid observation', [{ path: 'meal_items', code: 'not_allowed', message: `tracker '${def.key}' has no meal items` }]);

  const user = await getUser(tx);
  const occurred = new Date(input.occurred_at);
  const recorded = new Date();
  if (occurred.getTime() > recorded.getTime() + 24 * 3600_000) throw validation('Invalid time', [{ path: 'occurred_at', code: 'future', message: 'occurred_at is more than 24 h in the future — check the device clock' }]);
  if (occurred.getTime() < recorded.getTime() - 5 * 365.25 * 24 * 3600_000) throw validation('Invalid time', [{ path: 'occurred_at', code: 'too_old', message: 'occurred_at is more than 5 years ago' }]);
  const day = localDay(occurred, { timezone: user.timezone, dayRollover: user.day_rollover });
  const precision = deriveTimePrecision(input.time_source, occurred, recorded, deps.analysis.exact_recording_delay_hours);
  const id = input.id ?? uuidv7();
  const items = input.meal_items ?? [];
  const hasContent = Boolean(input.values.description) || (Array.isArray(input.values.photos) && input.values.photos.length > 0);
  const specificity = def.has_meal_items ? deriveSpecificity(items, hasContent) : 'resolved';
  const parseStatus = def.has_meal_items && items.length === 0 && input.values.description ? 'pending' : 'none';

  await tx.query(
    `INSERT INTO observation (id, user_id, tracker_key, def_version, def_hash, occurred_at, local_day, recorded_at, source, confidence, note,
       client_id, device_id, group_id, batch_id, specificity, time_precision, parse_status)
     VALUES ($1, app_current_user(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [id, def.key, def.version, reg.hash, occurred, day, recorded, input.source, input.confidence ?? null,
      deps.keys.crypto.sealOpt('observation', 'note', id, input.note), input.client_id, ctx.deviceId, input.group_id ?? null,
      input.batch_id ?? null, specificity, precision, parseStatus]);
  await writeValues(tx, deps, def, id, input.values as ObservationValues);
  if (items.length) await writeMealItems(tx, deps, id, items, occurred);

  const obs = (await loadObservation(tx, deps, id))!;
  const { rows: prof } = await tx.query<{ birth_year: number | null }>('SELECT birth_year FROM user_profile');
  const flags = await evaluateSafety(tx, def, { id, local_day: day, values: obs.values }, { birth_year: prof[0]?.birth_year ?? null });
  for (const h of postWriteHooks) await h(tx, ctx, obs, def);
  await logChange(tx, ctx, obs, 'upsert');
  if (parseStatus === 'pending') {
    await tx.query(`INSERT INTO job (kind, user_id, payload, dedupe_key) VALUES ('parse_meal', app_current_user(), $1, $2) ON CONFLICT DO NOTHING`,
      [{ observation_id: id }, `parse_meal:${id}`]);
  }
  return { observation: obs, created: true, safety_flags: flags };
}

export interface UpdateInput {
  occurred_at?: string; time_source?: string; note?: string | null; values?: Record<string, unknown>; meal_items?: MealItemInput[];
  specificity?: string; base_revision?: number; client_recorded_at?: string;
}
export interface UpdateResult { observation: ObservationPayload; conflicts: { fields: string[]; resolution: string; server_state: ObservationPayload } | null; safety_flags: RaisedFlag[] }

/**
 * Partial update with per-field last-write-wins (02 §6). If the client edited from an older
 * revision, fields the server also changed since then are decided by edit time (server clock
 * for the server's side; the client's edit time clamped to now), device id as tiebreak.
 * The losing state is preserved in observation_revision — never silently lost.
 */
export async function updateObservation(tx: Tx, ctx: WriteCtx, id: string, patch: UpdateInput, reason = 'edit'): Promise<UpdateResult> {
  const { deps } = ctx;
  const cur = await loadObservation(tx, deps, id);
  if (!cur) throw notFound('observation');
  if (cur.deleted_at) throw new HttpProblem(409, 'deleted', 'This entry was deleted', 'It was deleted on another device. Restore it from Recently deleted if that was a mistake.');
  const reg = await deps.registry.get(tx, cur.tracker_key);
  if (!reg) throw notFound('tracker');
  const def = reg.def;

  let conflicts: UpdateResult['conflicts'] = null;
  const next = { values: { ...cur.values }, note: cur.note, occurred_at: cur.occurred_at, meal_items: cur.meal_items };
  const incoming: Record<string, unknown> = { ...(patch.values ? Object.fromEntries(Object.entries(patch.values).map(([k, v]) => [`v.${k}`, v])) : {}) };
  if (patch.note !== undefined) incoming.note = patch.note;
  if (patch.occurred_at !== undefined) incoming.occurred_at = patch.occurred_at;

  let serverWins = new Set<string>();
  if (patch.base_revision !== undefined && patch.base_revision < cur.revision) {
    const revs = await revisions(tx, deps, id);
    const base = revs.find((r) => r.revision === patch.base_revision)?.snapshot as ObservationPayload | undefined;
    const lastServerEdit = revs.length ? revs[revs.length - 1]!.changed_at : new Date(cur.recorded_at);
    const clientAt = patch.client_recorded_at ? new Date(Math.min(Date.parse(patch.client_recorded_at), Date.now())) : new Date(0);
    const serverChanged = (k: string) => {
      if (!base) return true;
      if (k === 'note') return base.note !== cur.note;
      if (k === 'occurred_at') return base.occurred_at !== cur.occurred_at;
      const f = k.slice(2); return JSON.stringify(base.values[f]) !== JSON.stringify(cur.values[f]);
    };
    const clientWinsTime = clientAt.getTime() > lastServerEdit.getTime()
      || (clientAt.getTime() === lastServerEdit.getTime() && String(ctx.deviceId ?? '') > String(revs[revs.length - 1]?.changed_by ?? ''));
    serverWins = new Set(Object.keys(incoming).filter((k) => serverChanged(k) && !clientWinsTime));
    if (serverWins.size) {
      conflicts = { fields: [...serverWins].map((k) => k.replace(/^v\./, '')), resolution: 'server_wins_field', server_state: cur };
      const loser = { ...cur, revision: cur.revision, values: { ...cur.values }, note: cur.note };
      for (const k of serverWins) { if (k.startsWith('v.')) loser.values[k.slice(2)] = incoming[k]; else (loser as Record<string, unknown>)[k] = incoming[k]; }
      await snapshot(tx, ctx, loser, 'conflict_loser');
    }
  }
  for (const [k, v] of Object.entries(incoming)) {
    if (serverWins.has(k)) continue;
    if (k.startsWith('v.')) { if (v === null) delete next.values[k.slice(2)]; else next.values[k.slice(2)] = v; }
    else if (k === 'note') next.note = (v as string | null) ?? null;
    else if (k === 'occurred_at') next.occurred_at = v as string;
  }
  const issues = validateValues(def, next.values as ObservationValues);
  if (issues.length) throw validation('Invalid observation', issues);

  await snapshot(tx, ctx, cur, reason);
  const user = await getUser(tx);
  const occurred = new Date(next.occurred_at);
  const day = localDay(occurred, { timezone: user.timezone, dayRollover: user.day_rollover });
  // Promotion is one-way: setting a time by hand promotes to exact; nothing demotes (02 §11.1).
  const precision = patch.occurred_at !== undefined && patch.time_source === 'user_set' ? 'exact' : cur.time_precision;
  let specificity = cur.specificity;
  if (patch.meal_items) {
    await writeMealItems(tx, deps, id, patch.meal_items, occurred);
    specificity = deriveSpecificity(patch.meal_items, Boolean(next.values.description));
  } else if (patch.specificity === 'unspecified' && def.has_meal_items && !(cur.meal_items?.some((m) => m.food_id))) {
    specificity = 'unspecified';
  }
  await tx.query(
    `UPDATE observation SET occurred_at = $2, local_day = $3, note = $4, revision = revision + 1, time_precision = $5, specificity = $6,
       parse_status = CASE WHEN $7::bool THEN 'done' ELSE parse_status END
     WHERE id = $1`,
    [id, occurred, day, deps.keys.crypto.sealOpt('observation', 'note', id, next.note), precision, specificity, Boolean(patch.meal_items)]);
  await writeValues(tx, deps, def, id, next.values as ObservationValues);
  const obs = (await loadObservation(tx, deps, id))!;
  const { rows: prof } = await tx.query<{ birth_year: number | null }>('SELECT birth_year FROM user_profile');
  const flags = await evaluateSafety(tx, def, { id, local_day: day, values: obs.values }, { birth_year: prof[0]?.birth_year ?? null });
  for (const h of postWriteHooks) await h(tx, ctx, obs, def);
  await logChange(tx, ctx, obs, 'upsert');
  return { observation: obs, conflicts, safety_flags: flags };
}

export async function deleteObservation(tx: Tx, ctx: WriteCtx, id: string): Promise<ObservationPayload> {
  const cur = await loadObservation(tx, ctx.deps, id);
  if (!cur) throw notFound('observation');
  if (cur.deleted_at) return cur;
  await snapshot(tx, ctx, cur, 'delete');
  await tx.query('UPDATE observation SET deleted_at = now(), revision = revision + 1 WHERE id = $1', [id]);
  const obs = (await loadObservation(tx, ctx.deps, id))!;
  const reg = await ctx.deps.registry.get(tx, obs.tracker_key);
  if (reg) for (const h of postWriteHooks) await h(tx, ctx, obs, reg.def);
  await logChange(tx, ctx, obs, 'delete');
  return obs;
}

export async function restoreObservation(tx: Tx, ctx: WriteCtx, id: string): Promise<ObservationPayload> {
  const { rows } = await tx.query<{ deleted_at: Date | null }>('SELECT deleted_at FROM observation WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('observation');
  if (!rows[0].deleted_at) return (await loadObservation(tx, ctx.deps, id))!;
  if (rows[0].deleted_at.getTime() < Date.now() - 30 * 86400_000) throw new HttpProblem(410, 'expired', 'Too old to restore', 'Deleted entries can be restored for 30 days.');
  await tx.query('UPDATE observation SET deleted_at = NULL, revision = revision + 1 WHERE id = $1', [id]);
  const obs = (await loadObservation(tx, ctx.deps, id))!;
  await snapshot(tx, ctx, obs, 'restore');
  await logChange(tx, ctx, obs, 'upsert');
  return obs;
}
