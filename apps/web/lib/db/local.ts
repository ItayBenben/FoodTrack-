/**
 * The device store (02 §5). IndexedDB is the source of truth for the UI; the server is
 * the source of truth for history. Plaintext by design (02 §9.4) — logout clears it.
 */
import Dexie, { type Table } from 'dexie';
import type { MealItemInput } from '@foodtrack/shared';

export interface LocalObservation {
  id: string; client_id: string; tracker_key: string; occurred_at: string; local_day: string; time_source: string;
  values: Record<string, unknown>; note: string | null; meal_items?: (MealItemInput & { canonical_name?: string | null })[];
  revision: number; deleted_at: string | null; group_id?: string | null; batch_id?: string | null;
  specificity?: string; time_precision?: string; parse_status?: string; recorded_at: string;
  sync: 'pending' | 'synced' | 'failed'; sync_error?: string | null;
}
export interface OutboxRow {
  seq?: number; mutation_id: string; op: 'upsert' | 'delete'; entity: 'observation'; entity_id: string;
  base_revision: number; recorded_at: string; attempts: number; next_attempt_at: number; status: 'pending' | 'failed'; last_error?: string | null;
}
export interface Draft { id: string; tracker_key: string; created_at: string; data: Record<string, unknown> }
export interface MetaRow { key: string; value: unknown }
export interface DefRow { key: string; content_hash: string; definition: unknown; custom: boolean }
export interface FoodRow { id: string; canonical_name: string; names: string[]; times_logged?: number }

export class LocalDB extends Dexie {
  observations!: Table<LocalObservation, string>;
  outbox!: Table<OutboxRow, number>;
  drafts!: Table<Draft, string>;
  meta!: Table<MetaRow, string>;
  defs!: Table<DefRow, string>;
  foods!: Table<FoodRow, string>;
  media_queue!: Table<{ id: string; observation_id: string; blob: Blob; created_at: string }, string>;
  constructor() {
    super('foodtrack');
    this.version(1).stores({
      observations: 'id, client_id, local_day, occurred_at, tracker_key, sync',
      outbox: '++seq, mutation_id, entity_id, status',
      drafts: 'id, tracker_key, created_at',
      meta: 'key',
      defs: 'key',
      foods: 'id, canonical_name, *names',
      media_queue: 'id, observation_id',
    });
  }
}

let _db: LocalDB | null = null;
export function db(): LocalDB { if (!_db) _db = new LocalDB(); return _db; }

export async function getMeta<T>(key: string, fallback: T): Promise<T> { const r = await db().meta.get(key); return (r?.value as T) ?? fallback; }
export async function setMeta(key: string, value: unknown) { await db().meta.put({ key, value }); }

export async function deviceId(): Promise<string> {
  let id = await getMeta<string | null>('device_id', null);
  if (!id) { id = `dev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`; await setMeta('device_id', id); }
  return id;
}

/** Logout / account deletion: everything on the device goes (08 §3.3). */
export async function wipeLocal() { await db().delete(); _db = null; }
