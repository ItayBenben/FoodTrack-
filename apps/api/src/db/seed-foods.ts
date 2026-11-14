/** Loads config/foods/seed.json + config/food-tags/fodmap.json into the shared food tables (owner role). Idempotent. */
import pg from 'pg';
import { readConfigJson } from '../config.js';

interface SeedFood {
  canonical_name: string; names_i18n: Record<string, string[]>; category: string; default_unit: string; default_qty: number;
  grams_per_unit: number; nutrients: Record<string, number>; tags: string[]; components?: { food: string; fraction: number | null }[];
}
interface FodmapGroup { key: string; subgroups: Record<string, 'high' | 'moderate' | 'low'>; foods: string[]; citations: string[] }

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function seedFoods(ownerUrl: string): Promise<{ foods: number; tags: number; components: number }> {
  const { foods } = readConfigJson<{ foods: SeedFood[] }>('foods/seed.json');
  const { groups } = readConfigJson<{ groups: FodmapGroup[] }>('food-tags/fodmap.json');
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  let nTags = 0; let nComp = 0;
  try {
    await client.query('BEGIN');
    const ids = new Map<string, string>();
    for (const f of foods) {
      const search = [f.canonical_name, ...Object.values(f.names_i18n).flat()].map((s) => s.toLowerCase()).join(' | ');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO food (canonical_name, names_i18n, search_text, category, source, external_ref, default_unit, default_qty, grams_per_unit, is_verified)
         VALUES ($1,$2,$3,$4,'seed',$5,$6,$7,$8,true)
         ON CONFLICT (source, external_ref) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, names_i18n = EXCLUDED.names_i18n,
           search_text = EXCLUDED.search_text, category = EXCLUDED.category, default_unit = EXCLUDED.default_unit,
           default_qty = EXCLUDED.default_qty, grams_per_unit = EXCLUDED.grams_per_unit
         RETURNING id`, [f.canonical_name, f.names_i18n, search, f.category, slug(f.canonical_name), f.default_unit, f.default_qty, f.grams_per_unit]);
      const id = rows[0]!.id; ids.set(f.canonical_name, id);
      for (const [n, v] of Object.entries(f.nutrients)) {
        await client.query(`INSERT INTO food_nutrient (food_id, nutrient, per_100g, source) VALUES ($1,$2,$3,'seed')
          ON CONFLICT (food_id, nutrient) DO UPDATE SET per_100g = EXCLUDED.per_100g WHERE food_nutrient.source = 'seed'`, [id, n, v]);
      }
      await client.query(`DELETE FROM food_tag WHERE food_id = $1 AND source IN ('seed') `, [id]);
      for (const t of f.tags) { await client.query(`INSERT INTO food_tag (food_id, tag, source) VALUES ($1,$2,'seed') ON CONFLICT DO NOTHING`, [id, t]); nTags++; }
    }
    await client.query(`DELETE FROM food_tag WHERE source LIKE 'fodmap:%'`);
    for (const g of groups) for (const name of g.foods) {
      const id = ids.get(name); if (!id) throw new Error(`fodmap.json group ${g.key}: unknown food '${name}'`);
      for (const [sub, cls] of Object.entries(g.subgroups)) {
        await client.query(`INSERT INTO food_tag (food_id, tag, source) VALUES ($1,$2,$3) ON CONFLICT (food_id, tag) DO NOTHING`, [id, `fodmap_${sub}_${cls}`, `fodmap:${g.citations.join(',')}`]);
        nTags++;
      }
    }
    for (const f of foods) {
      const parent = ids.get(f.canonical_name)!;
      await client.query(`DELETE FROM food_component WHERE parent_food_id = $1 AND source = 'pack'`, [parent]);
      for (const [i, c] of (f.components ?? []).entries()) {
        await client.query(`INSERT INTO food_component (parent_food_id, component_food_id, fraction, source, position) VALUES ($1,$2,$3,'pack',$4) ON CONFLICT DO NOTHING`,
          [parent, ids.get(c.food)!, c.fraction, i]);
        nComp++;
      }
    }
    await client.query('COMMIT');
    await client.query('SELECT refresh_derived()');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { await client.end(); }
  return { foods: foods.length, tags: nTags, components: nComp };
}
