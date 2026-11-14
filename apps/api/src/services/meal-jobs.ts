/** Deferred parsing: offline saves and day-builder slots parse in the background (08 §4.2, 03 §16). */
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { handlers, publish } from '../workers/jobs.js';
import { MealParser } from './meal-parse.js';
import { deriveSpecificity, loadObservation, logChange, writeMealItems } from './observations.js';
import { getUser } from './users.js';

export async function parseStoredMeal(tx: Tx, deps: Deps, observationId: string, opts: { force?: boolean; attempt?: number } = {}) {
  const obs = await loadObservation(tx, deps, observationId);
  if (!obs || obs.deleted_at) return { skipped: 'gone' };
  if (!opts.force && obs.meal_items?.length) return { skipped: 'already_has_items' };
  const text = String(obs.values.description ?? '').trim();
  if (!text) return { skipped: 'no_text' };
  const user = await getUser(tx);
  const r = await new MealParser(tx, deps, user.locale).parse(text);
  if (r.degraded && !r.items.some((i) => i.food_id)) {
    // Nothing could be placed without the model: mark it, and try again later with backoff.
    await tx.query(`UPDATE observation SET parse_status = 'degraded' WHERE id = $1`, [observationId]);
    const attempt = opts.attempt ?? 0;
    if (attempt < 8) await tx.query(`INSERT INTO job (kind, user_id, payload, run_after, dedupe_key) VALUES ('parse_meal', app_current_user(), $1, now() + make_interval(mins => $2), $3) ON CONFLICT DO NOTHING`,
      [{ observation_id: observationId, attempt: attempt + 1 }, 2 ** attempt, `parse_meal:${observationId}:retry${attempt + 1}`]);
    return { degraded: true, retry: attempt < 8 };
  }
  await writeMealItems(tx, deps, observationId, r.items, new Date(obs.occurred_at));
  const spec = deriveSpecificity(r.items, true);
  await tx.query(`UPDATE observation SET specificity = $2, parse_status = $3, revision = revision + 1 WHERE id = $1`, [observationId, spec, r.degraded ? 'degraded' : 'done']);
  const after = (await loadObservation(tx, deps, observationId))!;
  await logChange(tx, { deps, deviceId: 'server' }, after, 'upsert');
  await publish(deps, tx, user.id, 'parse.completed', { observation_id: observationId, n_items: r.items.length, occurred_at: after.occurred_at });
  return { items: r.items.length, tier: r.tier };
}

handlers.set('parse_meal', (tx, deps, p) => parseStoredMeal(tx, deps, String(p.observation_id), { attempt: Number(p.attempt ?? 0) }));
