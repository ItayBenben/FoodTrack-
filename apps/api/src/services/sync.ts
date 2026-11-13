/**
 * Offline sync (03 §8). Push is transactional per mutation — one bad row never blocks
 * the rest. Pull returns change_log rows after the cursor; payloads pass through the
 * explicit column allowlist and a forbidden-key check before they leave the server.
 */
import { containsForbiddenKey, pick, SYNC_ALLOWLIST, type Mutation } from '@foodtrack/shared';
import type { Deps } from '../app.js';
import { withUser } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';
import { createObservation, deleteObservation, openFromLog, updateObservation } from './observations.js';

export interface PushResult {
  applied: { client_id: string; entity_id: string; revision: number; local_day: string }[];
  conflicts: { client_id: string; entity_id: string; resolution: string; fields: string[]; server_state: unknown }[];
  rejected: { client_id: string; reason: string; detail: string; errors?: unknown }[];
  new_seq: number;
}

export async function push(deps: Deps, userId: string, deviceId: string, mutations: Mutation[]): Promise<PushResult> {
  const out: PushResult = { applied: [], conflicts: [], rejected: [], new_seq: 0 };
  const ctx = { deps, deviceId };
  for (const m of mutations) {
    try {
      await withUser(deps.db, userId, async (tx) => {
        if (m.op === 'upsert') {
          const existing = (await tx.query<{ id: string; deleted_at: Date | null }>('SELECT id, deleted_at FROM observation WHERE client_id = $1 OR id = $2',
            [m.payload.client_id, m.payload.id ?? '00000000-0000-0000-0000-000000000000'])).rows[0];
          if (!existing) {
            const r = await createObservation(tx, ctx, m.payload);
            out.applied.push({ client_id: m.client_id, entity_id: r.observation.id, revision: r.observation.revision, local_day: r.observation.local_day });
            return;
          }
          if (existing.deleted_at) {
            // A conflict on a deleted record resolves to deleted (02 §6).
            out.conflicts.push({ client_id: m.client_id, entity_id: existing.id, resolution: 'deleted_wins', fields: [], server_state: { id: existing.id, deleted_at: existing.deleted_at } });
            return;
          }
          if (m.base_revision === undefined || m.base_revision === 0) {
            // Replay of the original create: idempotent.
            const r = await createObservation(tx, ctx, m.payload);
            out.applied.push({ client_id: m.client_id, entity_id: r.observation.id, revision: r.observation.revision, local_day: r.observation.local_day });
            return;
          }
          const r = await updateObservation(tx, ctx, existing.id, {
            occurred_at: m.payload.occurred_at, time_source: m.payload.time_source, note: m.payload.note, values: m.payload.values,
            meal_items: m.payload.meal_items, specificity: m.payload.specificity, base_revision: m.base_revision, client_recorded_at: m.recorded_at,
          });
          out.applied.push({ client_id: m.client_id, entity_id: r.observation.id, revision: r.observation.revision, local_day: r.observation.local_day });
          if (r.conflicts) out.conflicts.push({ client_id: m.client_id, entity_id: existing.id, ...r.conflicts });
        } else {
          const target = m.entity_id ?? (await tx.query<{ id: string }>('SELECT id FROM observation WHERE client_id = $1', [m.target_client_id ?? ''])).rows[0]?.id;
          if (!target) { out.applied.push({ client_id: m.client_id, entity_id: '', revision: 0, local_day: '' }); return; } // never existed server-side: nothing to delete
          const r = await deleteObservation(tx, ctx, target);
          out.applied.push({ client_id: m.client_id, entity_id: r.id, revision: r.revision, local_day: r.local_day });
        }
      });
    } catch (e) {
      const p = e instanceof HttpProblem ? e : null;
      out.rejected.push({ client_id: m.client_id, reason: p?.type ?? 'error', detail: p?.detail ?? (e as Error).message, errors: p?.errors });
    }
  }
  out.new_seq = await withUser(deps.db, userId, async (tx) => {
    const { rows } = await tx.query<{ s: number | null }>('SELECT max(seq) AS s FROM change_log');
    await tx.query(`INSERT INTO sync_cursor (user_id, device_id, last_seen_seq) VALUES (app_current_user(), $1, 0) ON CONFLICT DO NOTHING`, [deviceId]);
    return rows[0]?.s ?? 0;
  });
  if (out.applied.length) deps.events.publish({ user_id: userId, type: 'sync.hint', data: { new_seq: out.new_seq, from_device: deviceId } });
  return out;
}

export function toSyncPayload(entity: string, payload: Record<string, unknown>): Record<string, unknown> {
  const allow = (SYNC_ALLOWLIST as Record<string, readonly string[]>)[entity];
  if (!allow) throw new Error(`no sync allowlist for entity '${entity}'`);
  const out = pick(payload, allow) as Record<string, unknown>;
  if (Array.isArray(out.meal_items)) out.meal_items = (out.meal_items as Record<string, unknown>[]).map((i) => pick(i, SYNC_ALLOWLIST.meal_item));
  const bad = containsForbiddenKey(out);
  if (bad) throw new Error(`refusing to sync forbidden key '${bad}'`);
  return out;
}

export async function pull(deps: Deps, userId: string, deviceId: string, since: number, limit: number) {
  return withUser(deps.db, userId, async (tx) => {
    const { rows } = await tx.query<{ seq: number; entity: string; entity_id: string; op: string; payload: Record<string, unknown>; at: Date }>(
      'SELECT seq, entity, entity_id, op, payload, at FROM change_log WHERE seq > $1 ORDER BY seq LIMIT $2', [since, limit + 1]);
    const page = rows.slice(0, limit);
    const changes = page.map((r) => ({ seq: r.seq, entity: r.entity, entity_id: r.entity_id, op: r.op,
      payload: toSyncPayload(r.entity, r.entity === 'observation' ? openFromLog(deps, r.entity_id, r.payload) : r.payload) }));
    const next = page.length ? page[page.length - 1]!.seq : since;
    await tx.query(`INSERT INTO sync_cursor (user_id, device_id, last_seen_seq) VALUES (app_current_user(), $1, $2)
                    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_seq = greatest(sync_cursor.last_seen_seq, EXCLUDED.last_seen_seq), updated_at = now()`, [deviceId, next]);
    return { changes, next_seq: next, has_more: rows.length > limit };
  });
}
