import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { notFound } from '../lib/problem.js';

export async function applyPack(tx: Tx, deps: Deps, key: string) {
  const pack = deps.registry.packs.find((p) => p.key === key);
  if (!pack) throw notFound('pack');
  for (const [i, t] of pack.trackers.entries()) {
    await tx.query(`INSERT INTO user_tracker (user_id, tracker_key, enabled, sort_order) VALUES (app_current_user(), $1, true, $2)
      ON CONFLICT (user_id, tracker_key) DO UPDATE SET enabled = true`, [t, (i + 1) * 10]);
  }
  return pack;
}

/** Inverse of apply: disables the pack's trackers that no other active pack needs. Never deletes data. */
export async function removePack(tx: Tx, deps: Deps, key: string) {
  const pack = deps.registry.packs.find((p) => p.key === key);
  if (!pack) throw notFound('pack');
  const { rows } = await tx.query<{ tracker_key: string }>('SELECT tracker_key FROM user_tracker WHERE enabled');
  const enabled = new Set(rows.map((r) => r.tracker_key));
  const stillNeeded = new Set(deps.registry.packs.filter((p) => p.key !== key && p.trackers.every((t) => enabled.has(t))).flatMap((p) => p.trackers));
  const off = pack.trackers.filter((t) => !stillNeeded.has(t));
  await tx.query('UPDATE user_tracker SET enabled = false WHERE tracker_key = ANY($1::text[])', [off]);
  return { disabled: off };
}
