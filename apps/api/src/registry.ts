/**
 * The tracker registry: operator config (config/trackers) ∪ per-user definitions
 * (user_tracker_definition). Everything downstream reads the merged registry and
 * cannot tell the two apart (02 §8.3).
 */
import { join } from 'node:path';
import pg from 'pg';
import { contentHash, parseTrackerDefinition, type Pack, type TrackerDefinition } from '@foodtrack/tracker-schema';
import { loadPackDir, loadTrackerDir, type LoadedTracker } from '@foodtrack/tracker-schema/loader';
import type { Tx } from './db/pool.js';

export interface RegisteredTracker { def: TrackerDefinition; hash: string; custom: boolean }

export class TrackerRegistry {
  private readonly shared = new Map<string, RegisteredTracker>();
  readonly packs: Pack[];
  readonly loaded: LoadedTracker[];

  constructor(configDir: string) {
    this.loaded = loadTrackerDir(join(configDir, 'trackers'));
    for (const t of this.loaded) this.shared.set(t.def.key, { def: t.def, hash: t.hash, custom: false });
    this.packs = loadPackDir(join(configDir, 'packs'), new Set(this.shared.keys()));
  }

  /** Persist the operator definitions (owner connection — the app role cannot write them). */
  async register(ownerUrl: string): Promise<void> {
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    try {
      for (const { def, hash } of this.shared.values()) {
        await client.query(
          `INSERT INTO tracker_definition (key, version, content_hash, definition) VALUES ($1,$2,$3,$4)
           ON CONFLICT (key) DO UPDATE SET version = EXCLUDED.version, content_hash = EXCLUDED.content_hash,
             definition = EXCLUDED.definition, loaded_at = now()
           WHERE tracker_definition.content_hash <> EXCLUDED.content_hash`, [def.key, def.version, hash, def]);
        await client.query(
          `INSERT INTO tracker_definition_history (key, content_hash, version, definition) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [def.key, hash, def.version, def]);
      }
    } finally { await client.end(); }
  }

  sharedList(): RegisteredTracker[] { return [...this.shared.values()]; }
  getShared(key: string): RegisteredTracker | undefined { return this.shared.get(key); }

  /** The merged registry for one user. Must be called inside withUser(). */
  async forUser(tx: Tx): Promise<Map<string, RegisteredTracker>> {
    const out = new Map(this.shared);
    const { rows } = await tx.query<{ key: string; definition: unknown; content_hash: string }>(
      'SELECT key, definition, content_hash FROM user_tracker_definition WHERE deleted_at IS NULL');
    for (const r of rows) {
      try { out.set(r.key, { def: parseTrackerDefinition(r.definition, `user:${r.key}`), hash: r.content_hash, custom: true }); }
      catch { /* a stored custom definition that no longer validates is skipped, never crashes the user */ }
    }
    return out;
  }

  async get(tx: Tx, key: string): Promise<RegisteredTracker | undefined> {
    if (this.shared.has(key)) return this.shared.get(key);
    return (await this.forUser(tx)).get(key);
  }

  static hashOf(def: TrackerDefinition) { return contentHash(def); }
}
