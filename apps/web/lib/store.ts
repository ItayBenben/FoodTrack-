'use client';
/**
 * The write path (06 §4): write to Dexie + outbox synchronously → UI re-renders from Dexie
 * → the outbox drains in the background (debounced 1 s, on reconnect, exponential backoff
 * 1 s → 60 s, survives restart). The network is never on the critical path of a save.
 */
import { create } from 'zustand';
import { localDay, uuidv7, type MealItemInput } from '@foodtrack/shared';
import { api, ApiError, hasToken } from './api';
import { db, deviceId, getMeta, setMeta, type LocalObservation, type OutboxRow } from './db/local';

export interface SyncState { online: boolean; syncing: boolean; pending: number; failed: number; lastSyncAt: string | null; needsUnlock: boolean }
export const useSync = create<SyncState>(() => ({ online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false, pending: 0, failed: 0, lastSyncAt: null, needsUnlock: false }));

export interface UserMeta { id: string; timezone: string; day_rollover: string; locale: string; idle_lock_minutes: number; display_name: string | null }
export async function userMeta(): Promise<UserMeta | null> { return getMeta<UserMeta | null>('user', null); }

export function dayOf(iso: string, u: UserMeta | null): string {
  return localDay(iso, { timezone: u?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, dayRollover: u?.day_rollover ?? '04:00' });
}

export interface SaveInput {
  tracker_key: string; values: Record<string, unknown>; occurred_at?: string; time_source?: string; note?: string | null;
  meal_items?: MealItemInput[]; group_id?: string | null; batch_id?: string | null; id?: string; specificity?: 'unspecified';
}

async function refreshCounts() {
  const [pending, failed] = await Promise.all([db().outbox.where('status').equals('pending').count(), db().outbox.where('status').equals('failed').count()]);
  useSync.setState({ pending, failed });
}

/** Every stored time is a full ISO instant. A string without a zone (e.g. a picker's `2026-11-16T12:00:00`)
 *  is read as device-local — what the person meant. Unparseable input is left as-is for the server to reject. */
export function isoTime(s: string): string { const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toISOString(); }

/** Save: one IndexedDB transaction, then return. Measured < 100 ms in e2e. */
export async function saveObservation(input: SaveInput): Promise<LocalObservation> {
  const u = await userMeta();
  const now = new Date().toISOString();
  const occurred = input.occurred_at ? isoTime(input.occurred_at) : now;
  const row: LocalObservation = {
    id: input.id ?? uuidv7(), client_id: `c_${uuidv7()}`, tracker_key: input.tracker_key, occurred_at: occurred, local_day: dayOf(occurred, u),
    time_source: input.time_source ?? (input.occurred_at ? 'user_set' : 'now'), values: input.values, note: input.note ?? null,
    meal_items: input.meal_items, revision: 0, deleted_at: null, group_id: input.group_id ?? null, batch_id: input.batch_id ?? null,
    specificity: input.specificity, parse_status: !input.specificity && !input.meal_items?.length && typeof input.values.description === 'string' ? 'pending' : 'none',
    recorded_at: now, sync: 'pending',
  };
  await db().transaction('rw', db().observations, db().outbox, async () => {
    await db().observations.put(row);
    await db().outbox.add({ mutation_id: `m_${uuidv7()}`, op: 'upsert', entity: 'observation', entity_id: row.id, base_revision: 0, recorded_at: now, attempts: 0, next_attempt_at: 0, status: 'pending' });
  });
  scheduleDrain();
  void refreshCounts();
  return row;
}

export async function editObservation(id: string, patch: Partial<Pick<LocalObservation, 'values' | 'note' | 'occurred_at' | 'meal_items' | 'time_source'>>) {
  const u = await userMeta();
  const now = new Date().toISOString();
  await db().transaction('rw', db().observations, db().outbox, async () => {
    const cur = await db().observations.get(id); if (!cur) return;
    const next = { ...cur, ...patch, values: patch.values ? { ...cur.values, ...patch.values } : cur.values, sync: 'pending' as const };
    if (patch.occurred_at) { next.occurred_at = isoTime(patch.occurred_at); next.local_day = dayOf(next.occurred_at, u); }
    await db().observations.put(next);
    const queued = await db().outbox.where('entity_id').equals(id).filter((r) => r.op === 'upsert' && r.status === 'pending').first();
    if (!queued) await db().outbox.add({ mutation_id: `m_${uuidv7()}`, op: 'upsert', entity: 'observation', entity_id: id, base_revision: cur.revision, recorded_at: now, attempts: 0, next_attempt_at: 0, status: 'pending' });
    else await db().outbox.update(queued.seq!, { recorded_at: now });
  });
  scheduleDrain(); void refreshCounts();
}

export async function deleteLocal(id: string) {
  const now = new Date().toISOString();
  await db().transaction('rw', db().observations, db().outbox, async () => {
    const cur = await db().observations.get(id); if (!cur) return;
    await db().observations.put({ ...cur, deleted_at: now, sync: 'pending' });
    if (cur.revision === 0) {
      // never reached the server: drop the queued create instead of sending create + delete
      await db().outbox.where('entity_id').equals(id).delete();
      await db().observations.put({ ...cur, deleted_at: now, sync: 'synced' });
    } else {
      await db().outbox.add({ mutation_id: `m_${uuidv7()}`, op: 'delete', entity: 'observation', entity_id: id, base_revision: cur.revision, recorded_at: now, attempts: 0, next_attempt_at: 0, status: 'pending' });
    }
  });
  scheduleDrain(); void refreshCounts();
}

export async function undoDelete(id: string) {
  const cur = await db().observations.get(id); if (!cur) return;
  if (cur.revision === 0) {
    await db().transaction('rw', db().observations, db().outbox, async () => {
      await db().observations.put({ ...cur, deleted_at: null, sync: 'pending' });
      await db().outbox.add({ mutation_id: `m_${uuidv7()}`, op: 'upsert', entity: 'observation', entity_id: id, base_revision: 0, recorded_at: new Date().toISOString(), attempts: 0, next_attempt_at: 0, status: 'pending' });
    });
    scheduleDrain(); void refreshCounts(); return;
  }
  await db().outbox.where('entity_id').equals(id).filter((r) => r.op === 'delete' && r.status === 'pending').delete();
  await db().observations.put({ ...cur, deleted_at: null });
  try { await api(`/observations/${id}/restore`, { method: 'POST' }); } catch { /* offline: the delete never left, so nothing to restore */ }
  void refreshCounts();
}

// ───────────── drain ─────────────
let timer: ReturnType<typeof setTimeout> | null = null;
let draining = false;
export function scheduleDrain(ms = 1000) {
  if (typeof window === 'undefined') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void drain(); }, ms);
}

/** A photo that hasn't uploaded yet has a `local_…` placeholder id; the server must never store one. */
export const isLocalMediaId = (x: unknown) => typeof x === 'string' && x.startsWith('local_');
export function serverValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) out[k] = Array.isArray(v) && v.some(isLocalMediaId) ? v.filter((x) => !isLocalMediaId(x)) : v;
  return out;
}

function toPayload(o: LocalObservation) {
  return { id: o.id, client_id: o.client_id, tracker_key: o.tracker_key, occurred_at: isoTime(o.occurred_at), time_source: o.time_source, source: 'manual',
    note: o.note, values: serverValues(o.values), group_id: o.group_id ?? null, batch_id: o.batch_id ?? null, ...(o.specificity === 'unspecified' ? { specificity: 'unspecified' } : {}),
    ...(o.meal_items ? { meal_items: o.meal_items.map(({ canonical_name: _c, ...i }) => i) } : {}) };
}

export async function drain(): Promise<void> {
  if (draining || !hasToken()) return;
  draining = true; useSync.setState({ syncing: true });
  try {
    await uploadMedia();
    for (;;) {
      const now = Date.now();
      const rows = (await db().outbox.where('status').equals('pending').sortBy('seq')).filter((r) => r.next_attempt_at <= now).slice(0, 50);
      if (!rows.length) break;
      const mutations = [];
      const byMutation = new Map<string, OutboxRow>();
      for (const r of rows) {
        const o = await db().observations.get(r.entity_id);
        byMutation.set(r.mutation_id, r);
        if (r.op === 'delete') mutations.push({ client_id: r.mutation_id, entity: 'observation', op: 'delete', entity_id: r.entity_id, target_client_id: o?.client_id, recorded_at: r.recorded_at });
        else if (o) mutations.push({ client_id: r.mutation_id, entity: 'observation', op: 'upsert', base_revision: r.base_revision, recorded_at: r.recorded_at, payload: toPayload(o) });
        else await db().outbox.delete(r.seq!);
      }
      if (!mutations.length) continue;
      let res: { applied: { client_id: string; entity_id: string; revision: number; local_day: string }[]; conflicts: { client_id: string; entity_id: string; resolution: string; server_state: Record<string, unknown> }[]; rejected: { client_id: string; detail: string }[]; new_seq: number };
      try {
        res = await api('/sync/push', { method: 'POST', body: { device_id: await deviceId(), mutations } });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { useSync.setState({ needsUnlock: true }); break; }
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
          // The server refused the request itself; retrying the same bytes can never succeed. Keep the entries
          // on the device, mark them failed with the reason, and let "Retry failed" try again after a fix.
          for (const r of rows) await db().outbox.update(r.seq!, { status: 'failed', attempts: r.attempts + 1, last_error: e.message });
          break;
        }
        for (const r of rows) await db().outbox.update(r.seq!, { attempts: r.attempts + 1, next_attempt_at: Date.now() + Math.min(60_000, 1000 * 2 ** r.attempts), last_error: (e as Error).message });
        const wait = Math.min(60_000, 1000 * 2 ** (rows[0]!.attempts));
        scheduleDrain(wait);
        break;
      }
      await db().transaction('rw', db().observations, db().outbox, async () => {
        for (const a of res.applied) {
          const r = byMutation.get(a.client_id); if (!r) continue;
          await db().outbox.delete(r.seq!);
          const o = await db().observations.get(r.entity_id);
          const more = await db().outbox.where('entity_id').equals(r.entity_id).count();
          if (o) await db().observations.put({ ...o, revision: a.revision || o.revision, local_day: a.local_day || o.local_day, sync: more ? 'pending' : 'synced', sync_error: null });
          // later queued edits of this row are now based on the server's revision
          await db().outbox.where('entity_id').equals(r.entity_id).modify((x) => { if (x.base_revision === 0 && a.revision) x.base_revision = a.revision; });
        }
        for (const c of res.conflicts) {
          const r = byMutation.get(c.client_id); if (!r) continue;
          await db().outbox.delete(r.seq!);
          const s = c.server_state as Partial<LocalObservation> & { deleted_at?: string | null };
          const o = await db().observations.get(r.entity_id);
          if (o) await db().observations.put({ ...o, ...(s.values ? { values: s.values } : {}), ...(s.note !== undefined ? { note: s.note ?? null } : {}),
            ...(s.revision ? { revision: s.revision } : {}), deleted_at: s.deleted_at ?? o.deleted_at, sync: 'synced' });
        }
        for (const j of res.rejected) {
          const r = byMutation.get(j.client_id); if (!r) continue;
          await db().outbox.update(r.seq!, { status: 'failed', last_error: j.detail });
          const o = await db().observations.get(r.entity_id);
          if (o) await db().observations.put({ ...o, sync: 'failed', sync_error: j.detail });
        }
      });
      for (const n of (res as { notes?: { trial_exposure?: unknown }[] }).notes ?? []) if (n.trial_exposure) window.dispatchEvent(new CustomEvent('ft:trial-exposure', { detail: n.trial_exposure }));
      useSync.setState({ lastSyncAt: new Date().toISOString() });
    }
  } finally {
    draining = false; useSync.setState({ syncing: false }); await refreshCounts();
  }
}

/** Photos wait in IndexedDB until they upload; the observation then points at the server's media id. */
async function uploadMedia() {
  for (const m of await db().media_queue.toArray()) {
    const fd = new FormData(); fd.append('file', m.blob, 'photo');
    const { getAccessToken } = await import('./api');
    let r: Response;
    try { r = await fetch('/api/v1/media', { method: 'POST', body: fd, headers: { authorization: `Bearer ${getAccessToken()}` } }); } catch { return; }
    if (!r.ok) continue;
    const { media_id } = await r.json() as { media_id: string };
    await db().transaction('rw', db().observations, db().media_queue, db().outbox, async () => {
      const o = await db().observations.get(m.observation_id);
      const field = o && Object.keys(o.values).find((k) => Array.isArray(o.values[k]) && (o.values[k] as unknown[]).includes(m.id));
      if (o && field) {
        await db().observations.put({ ...o, values: { ...o.values, [field]: (o.values[field] as string[]).map((x) => (x === m.id ? media_id : x)) }, sync: 'pending' });
        // the row may already be on the server without this photo: make sure the real id follows it
        const queued = await db().outbox.where('entity_id').equals(o.id).filter((r) => r.op === 'upsert' && r.status === 'pending').first();
        if (!queued) await db().outbox.add({ mutation_id: `m_${uuidv7()}`, op: 'upsert', entity: 'observation', entity_id: o.id, base_revision: o.revision, recorded_at: new Date().toISOString(), attempts: 0, next_attempt_at: 0, status: 'pending' });
      }
      await db().media_queue.delete(m.id);
    });
  }
}

export async function retryFailed() {
  await db().outbox.where('status').equals('failed').modify({ status: 'pending', attempts: 0, next_attempt_at: 0 });
  await refreshCounts(); void drain();
}

// ───────────── pull ─────────────
export async function pull(): Promise<number> {
  if (!hasToken()) return 0;
  let since = await getMeta<number>('last_seq', 0); let n = 0;
  for (;;) {
    const r = await api<{ changes: { seq: number; entity: string; entity_id: string; op: string; payload: Record<string, unknown> }[]; next_seq: number; has_more: boolean }>(
      `/sync/pull?since=${since}&limit=500&device_id=${await deviceId()}`);
    await db().transaction('rw', db().observations, db().outbox, async () => {
      for (const c of r.changes) {
        if (c.entity !== 'observation') continue;
        const pendingLocal = await db().outbox.where('entity_id').equals(c.entity_id).count();
        if (pendingLocal) continue; // local, unpushed edits win until they are pushed
        const p = c.payload as unknown as LocalObservation;
        const cur = await db().observations.get(c.entity_id);
        if (cur && cur.revision > (p.revision ?? 0)) continue;
        await db().observations.put({ ...(cur ?? {}), ...p, time_source: cur?.time_source ?? 'user_set', sync: 'synced' } as LocalObservation);
      }
    });
    n += r.changes.length; since = r.next_seq; await setMeta('last_seq', since);
    if (!r.has_more) break;
  }
  return n;
}

/** "Retry all now": skip the backoff wait for everything pending, then drain and pull. */
export async function syncNow() {
  await db().outbox.where('status').equals('pending').modify({ next_attempt_at: 0 });
  await drain(); await pull().catch(() => 0);
}
