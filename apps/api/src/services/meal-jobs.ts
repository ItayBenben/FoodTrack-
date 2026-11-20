/** Deferred parsing: offline saves and day-builder slots parse in the background (08 §4.2, 03 §16). */
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { handlers, publish } from '../workers/jobs.js';
import { MealParser, type ResolvedItem } from './meal-parse.js';
import { deriveSpecificity, loadObservation, logChange, writeMealItems } from './observations.js';
import { getUser } from './users.js';
import { VISION_MIMES } from './media-types.js';

const MAX_PHOTOS_READ = 4;

export async function parseStoredMeal(tx: Tx, deps: Deps, observationId: string, opts: { force?: boolean; attempt?: number } = {}) {
  const obs = await loadObservation(tx, deps, observationId);
  if (!obs || obs.deleted_at) return { skipped: 'gone' };
  if (!opts.force && obs.meal_items?.length) return { skipped: 'already_has_items' };
  const text = String(obs.values.description ?? '').trim();
  const user = await getUser(tx);
  const parser = new MealParser(tx, deps, user.locale);
  let r: { items: ResolvedItem[]; degraded: boolean; tier?: 1 | 2 | 3 };
  if (text) r = await parser.parse(text);
  else {
    // A photo-only meal (08 §4.4): read the photos here, so a save made before — or without —
    // the composer's own photo read still ends up with foods instead of "Meal (no details)".
    const photos = await readStoredPhotos(tx, deps, obs.tracker_key, obs.values);
    if (photos === null) return { skipped: 'no_text' };
    if (!photos.length) return { skipped: 'photos_not_uploaded' }; // the upload's own edit re-queues this
    r = await readPhotoItems(deps, parser, photos, user.locale);
  }
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
  return { items: r.items.length, tier: r.tier ?? null };
}

/** Photos the meal's photo fields point at that are on the server and readable by the model. null: the meal has none. */
async function readStoredPhotos(tx: Tx, deps: Deps, trackerKey: string, values: Record<string, unknown>): Promise<{ image: Buffer; mime: string }[] | null> {
  const def = (await deps.registry.get(tx, trackerKey))?.def;
  const ids = (def?.fields ?? []).filter((f) => f.type === 'photo' || f.type === 'multi_photo')
    .flatMap((f) => { const v = values[f.key]; return Array.isArray(v) ? v : typeof v === 'string' ? [v] : []; })
    .filter((x): x is string => typeof x === 'string');
  if (!ids.length) return null;
  const { rows } = await tx.query<{ id: string; storage_key: string; mime: string; object_key_wrapped: Buffer; nonce: Buffer }>(
    `SELECT id, storage_key, mime, object_key_wrapped, nonce FROM media WHERE id::text = ANY($1) AND mime = ANY($2)`, [ids, [...VISION_MIMES]]);
  const out: { image: Buffer; mime: string }[] = [];
  for (const row of rows.slice(0, MAX_PHOTOS_READ)) {
    try { out.push({ image: deps.keys.crypto.openMedia(row.id, await deps.media.get(row.storage_key), row.object_key_wrapped, row.nonce), mime: row.mime }); }
    catch { /* a missing object is skipped, never fatal */ }
  }
  return out;
}

/** Every photo is read; foods seen in more than one are kept once. Degraded only if no photo could be read. */
async function readPhotoItems(deps: Deps, parser: MealParser, photos: { image: Buffer; mime: string }[], locale: string) {
  if (!deps.llm.describe().vision) return { items: [], degraded: true };
  const items: ResolvedItem[] = []; let read = 0;
  for (const p of photos) {
    const r = await deps.llm.parsePhoto({ ...p, locale });
    if (r.degraded) continue;
    read++;
    for (const it of await parser.resolveVision(r.items)) {
      if (it.food_id ? items.some((x) => x.food_id === it.food_id) : items.some((x) => x.raw_text === it.raw_text)) continue;
      items.push({ ...it, position: items.length });
    }
  }
  return { items, degraded: read === 0 };
}

handlers.set('parse_meal', (tx, deps, p) => parseStoredMeal(tx, deps, String(p.observation_id), { attempt: Number(p.attempt ?? 0) }));
