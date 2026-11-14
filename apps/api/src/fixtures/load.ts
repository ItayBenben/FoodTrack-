import type { ObservationInput } from '@foodtrack/shared';
import type { Deps } from '../app.js';
import { withUser, type Db } from '../db/pool.js';
import { createObservation } from '../services/observations.js';
import type { FoodRef } from './synthetic.js';

export async function loadFoodRefs(db: Db, userId: string): Promise<Map<string, FoodRef>> {
  return withUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string; canonical_name: string; names_i18n: { he?: string[] }; default_qty: number; default_unit: string; grams_per_unit: number }>(
      `SELECT id, canonical_name, names_i18n, default_qty, default_unit, grams_per_unit FROM food WHERE source = 'seed'`);
    return new Map(rows.map((f) => [f.canonical_name, { id: f.id, name: f.canonical_name, he: f.names_i18n.he?.[0] ?? f.canonical_name,
      qty: Number(f.default_qty), unit: f.default_unit, grams: Number(f.default_qty) * Number(f.grams_per_unit) }]));
  });
}

export async function insertFixture(deps: Deps, userId: string, observations: ObservationInput[], chunk = 50) {
  for (let i = 0; i < observations.length; i += chunk) {
    await withUser(deps.db, userId, async (tx) => {
      for (const o of observations.slice(i, i + chunk)) await createObservation(tx, { deps, deviceId: 'seed', changedBy: 'seed' }, o);
    });
  }
}
