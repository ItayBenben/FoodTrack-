import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withUser } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { MealParser } from '../services/meal-parse.js';
import { parseStoredMeal } from '../services/meal-jobs.js';
import { learnFood, loadObservation, logChange } from '../services/observations.js';
import { getUser } from '../services/users.js';
import { normalizeAlias } from '../crypto/envelope.js';

export async function mealRoutes(app: FastifyInstance) {
  const { deps } = app;
  const llmLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.post('/meals/parse', llmLimit, async (req, reply) => {
    const b = z.object({ text: z.string().min(1).max(1000), locale: z.string().optional(), occurred_at: z.string().optional() }).parse(req.body);
    const result = await withUser(deps.db, req.userId, async (tx) => {
      const user = await getUser(tx);
      return new MealParser(tx, deps, b.locale ?? user.locale).parse(b.text);
    });
    if (String(req.headers.accept ?? '').includes('text/event-stream')) {
      // SSE form: one event per item, then the summary (03 §5).
      reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      for (const it of result.items) reply.raw.write(`event: item\ndata: ${JSON.stringify(it)}\n\n`);
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ ...result, items: undefined })}\n\n`);
      reply.raw.end(); return reply.hijack();
    }
    return result;
  });

  app.post('/meals/:id/parse', llmLimit, async (req) => withUser(deps.db, req.userId, async (tx) => parseStoredMeal(tx, deps, (req.params as { id: string }).id, { force: true })));

  // Correcting an item trains the personal library (03 §13.3): the alias maps to the new food and the
  // corrected portion becomes the default for next time.
  app.patch('/meals/:id/items/:itemId', async (req) => {
    const p = req.params as { id: string; itemId: string };
    const b = z.object({ food_id: z.string().uuid().nullable().optional(), quantity: z.number().positive().nullable().optional(), unit: z.string().max(32).nullable().optional(),
      grams_est: z.number().nonnegative().nullable().optional(), portion_precision: z.enum(['weighed', 'measured', 'estimated', 'unspecified']).optional() }).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      const { rows } = await tx.query<{ id: string; raw_text: Buffer; food_id: string | null }>('SELECT id, raw_text, food_id FROM meal_item WHERE id = $1 AND observation_id = $2', [p.itemId, p.id]);
      if (!rows[0]) throw notFound('meal item');
      await tx.query(`UPDATE meal_item SET food_id = coalesce($2, food_id), quantity = coalesce($3, quantity), unit = coalesce($4, unit), grams_est = coalesce($5, grams_est),
        portion_precision = coalesce($6, portion_precision), resolved_by = 'user', confidence = 1 WHERE id = $1`,
        [p.itemId, b.food_id ?? null, b.quantity ?? null, b.unit ?? null, b.grams_est ?? null, b.portion_precision ?? null]);
      const foodId = b.food_id ?? rows[0].food_id;
      const raw = deps.keys.crypto.open('meal_item', 'raw_text', p.itemId, rows[0].raw_text)!;
      if (foodId) {
        const obs = await loadObservation(tx, deps, p.id);
        await learnFood(tx, deps, foodId, raw, b.quantity ?? null, b.unit ?? null, b.grams_est ?? null, new Date(obs!.occurred_at));
        if (b.grams_est || b.quantity) {
          await tx.query(`UPDATE user_food SET median_grams = coalesce($2, median_grams), median_qty = coalesce($3, median_qty), median_unit = coalesce($4, median_unit),
            qty_history = CASE WHEN $2::numeric IS NULL THEN qty_history ELSE ARRAY[$2::numeric] END WHERE food_id = $1`,
            [foodId, b.grams_est ?? null, b.quantity ?? null, b.unit ?? null]);
        }
      }
      const { rows: items } = await tx.query<{ food_id: string | null; confidence: number | null }>('SELECT food_id, confidence FROM meal_item WHERE observation_id = $1', [p.id]);
      const spec = items.every((i) => i.food_id) ? 'resolved' : items.some((i) => i.food_id) ? 'partial' : 'unspecified';
      await tx.query('UPDATE observation SET specificity = $2, revision = revision + 1 WHERE id = $1', [p.id, spec]);
      const obs = (await loadObservation(tx, deps, p.id))!;
      await logChange(tx, { deps, deviceId: 'server' }, obs, 'upsert');
      return obs;
    });
  });

  /** Quick-repeat tiles: most-logged meal combinations in a ±90 min window (05 §4.1). */
  app.get('/meals/favorites', async (req) => {
    const q = z.object({ at: z.string().optional(), limit: z.coerce.number().int().min(1).max(20).default(6) }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const user = await getUser(tx);
      const at = q.at ? new Date(q.at) : new Date();
      const { rows } = await tx.query<{ combo: string[]; n: number; last_id: string }>(
        `WITH m AS (
           SELECT o.id, o.occurred_at, array_agg(mi.food_id ORDER BY mi.food_id) AS combo
           FROM observation o JOIN meal_item mi ON mi.observation_id = o.id
           WHERE o.tracker_key = 'meal' AND o.deleted_at IS NULL AND mi.food_id IS NOT NULL AND o.occurred_at > now() - interval '120 days'
             AND abs(extract(epoch FROM ((o.occurred_at AT TIME ZONE $1)::time - ($2::timestamptz AT TIME ZONE $1)::time))) < 5400
           GROUP BY o.id, o.occurred_at)
         SELECT combo, count(*)::int AS n, (array_agg(id ORDER BY occurred_at DESC))[1] AS last_id FROM m GROUP BY combo HAVING count(*) >= 2 ORDER BY n DESC LIMIT $3`,
        [user.timezone, at, q.limit]);
      const data = [];
      for (const r of rows) {
        const o = await loadObservation(tx, deps, r.last_id);
        const items = [];
        for (const it of o?.meal_items ?? []) {
          const { rows: uf } = await tx.query<{ median_qty: number | null; median_unit: string | null; median_grams: number | null }>('SELECT median_qty, median_unit, median_grams FROM user_food WHERE food_id = $1', [it.food_id]);
          items.push({ raw_text: it.raw_text, food_id: it.food_id!, canonical_name: it.canonical_name, quantity: uf[0]?.median_qty ?? it.quantity, unit: uf[0]?.median_unit ?? it.unit, grams_est: uf[0]?.median_grams ?? it.grams_est });
        }
        data.push({ food_ids: r.combo, label: items.map((i) => i.raw_text).join(', '), items, times_logged: r.n });
      }
      return { data, total: data.length };
    });
  });

  /** Repeat returns a draft; it never saves (03 §13.3). */
  app.post('/meals/:id/repeat', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const o = await loadObservation(tx, deps, (req.params as { id: string }).id);
    if (!o || o.tracker_key !== 'meal') throw notFound('meal');
    return { draft: { tracker_key: 'meal', values: o.values, meal_items: o.meal_items, occurred_at: new Date().toISOString() } };
  }));

  /** D29 clarify options: the user's own ±90 min history, by SQL, no model. [] when fewer than 3. */
  app.get('/meals/suggestions', async (req) => {
    const q = z.object({ at: z.string(), exclude: z.string().optional() }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const user = await getUser(tx);
      const exclude = (q.exclude ?? '').split(',').filter(Boolean);
      const { rows } = await tx.query<{ id: string; canonical_name: string; names_i18n: Record<string, string[]>; times_logged: number }>(
        `SELECT f.id, f.canonical_name, f.names_i18n, count(*)::int AS times_logged
         FROM observation o JOIN meal_item mi ON mi.observation_id = o.id JOIN food f ON f.id = mi.food_id
         WHERE o.tracker_key = 'meal' AND o.deleted_at IS NULL AND NOT (f.id::text = ANY($3::text[]))
           AND abs(extract(epoch FROM ((o.occurred_at AT TIME ZONE $1)::time - ($2::timestamptz AT TIME ZONE $1)::time))) < 5400
         GROUP BY f.id, f.canonical_name, f.names_i18n ORDER BY count(*) DESC LIMIT 3`, [user.timezone, q.at, exclude]);
      return { data: rows.length < 3 ? [] : rows.map((r) => ({ ...r, label: (user.locale.startsWith('he') ? r.names_i18n.he?.[0] : null) ?? r.canonical_name })) };
    });
  });

  // ───────── foods ─────────
  app.get('/foods/search', async (req) => {
    const q = z.object({ q: z.string().min(1).max(100), locale: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(req.query);
    return withUser(deps.db, req.userId, async (tx) => {
      const user = await getUser(tx);
      const p = new MealParser(tx, deps, q.locale ?? user.locale);
      const can = await p.canonical(q.q, q.limit);
      const { rows: lib } = await tx.query<{ food_id: string; times_logged: number }>('SELECT food_id, times_logged FROM user_food');
      const t = new Map(lib.map((l) => [l.food_id, l.times_logged]));
      const data = can.map((c) => ({ id: c.food.id, canonical_name: c.food.canonical_name, names: c.food.names_i18n, category: c.food.category, score: Math.round(c.score * 100) / 100, in_library: t.has(c.food.id), times_logged: t.get(c.food.id) ?? 0 }))
        .sort((a, b) => Number(b.in_library) - Number(a.in_library) || b.score - a.score);
      return { data, total: data.length };
    });
  });
  app.get('/foods/library', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ food_id: string; canonical_name: string; names_i18n: unknown; times_logged: number; median_qty: number | null; median_unit: string | null; median_grams: number | null; source: string; is_verified: boolean; alias: Buffer | null; last_logged: Date }>(
      `SELECT uf.food_id, f.canonical_name, f.names_i18n, uf.times_logged, uf.median_qty, uf.median_unit, uf.median_grams, f.source, f.is_verified, uf.alias, uf.last_logged
       FROM user_food uf JOIN food f ON f.id = uf.food_id ORDER BY uf.times_logged DESC LIMIT 500`);
    const data = rows.map((r) => ({ ...r, alias: deps.keys.crypto.open('user_food', 'alias', r.food_id, r.alias) }));
    return { data, total: data.length };
  }));
  app.get('/foods/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const id = (req.params as { id: string }).id;
    const { rows } = await tx.query('SELECT id, canonical_name, names_i18n, category, source, default_unit, default_qty, grams_per_unit, is_verified, created_by IS NOT NULL AS personal FROM food WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('food');
    const { rows: nutrients } = await tx.query('SELECT nutrient, per_100g FROM food_nutrient WHERE food_id = $1 ORDER BY nutrient', [id]);
    const { rows: tags } = await tx.query('SELECT tag, source FROM food_tag WHERE food_id = $1 ORDER BY tag', [id]);
    return { ...rows[0], nutrients, tags };
  }));
  app.post('/foods', async (req, reply) => {
    const b = z.object({ name: z.string().min(1).max(120), names: z.record(z.string(), z.array(z.string().max(120))).optional(), category: z.string().max(40).optional(),
      default_unit: z.string().max(20).default('portion'), default_qty: z.number().positive().default(1), grams_per_unit: z.number().positive().nullable().optional(),
      tags: z.array(z.string().max(60)).max(30).optional(), components: z.array(z.object({ food_id: z.string().uuid(), fraction: z.number().gt(0).max(1).nullable().optional() })).max(30).optional() }).parse(req.body);
    return reply.status(201).send(await withUser(deps.db, req.userId, async (tx) => {
      const names = b.names ?? { en: [b.name.toLowerCase()] };
      const { rows } = await tx.query<{ id: string }>(`INSERT INTO food (canonical_name, names_i18n, search_text, category, source, external_ref, default_unit, default_qty, grams_per_unit, created_by)
        VALUES ($1,$2,$3,$4,'user',$5,$6,$7,$8,app_current_user()) RETURNING id`,
        [b.name, names, [b.name, ...Object.values(names).flat()].map((x) => normalizeAlias(x)).join(' | '), b.category ?? null, `user:${crypto.randomUUID()}`, b.default_unit, b.default_qty, b.grams_per_unit ?? null]);
      const id = rows[0]!.id;
      for (const t of b.tags ?? []) await tx.query(`INSERT INTO food_tag (food_id, tag, source) VALUES ($1,$2,'user')`, [id, t]);
      await setComponents(tx, id, b.components ?? []);
      return { id };
    }));
  });
  app.patch('/foods/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    const b = z.object({ name: z.string().min(1).max(120).optional(), names: z.record(z.string(), z.array(z.string())).optional(), tags: z.array(z.string()).optional(), grams_per_unit: z.number().positive().optional() }).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      const own = await tx.query('SELECT 1 FROM food WHERE id = $1 AND created_by = app_current_user()', [id]);
      if (!own.rows[0]) throw new HttpProblem(403, 'not_editable', 'Only foods you created can be edited', 'Shared foods come from the seed data. Create your own version, or merge into it.');
      if (b.name) await tx.query('UPDATE food SET canonical_name = $2 WHERE id = $1', [id, b.name]);
      if (b.names) await tx.query(`UPDATE food SET names_i18n = $2, search_text = $3 WHERE id = $1`, [id, b.names, Object.values(b.names).flat().map((x) => normalizeAlias(x)).join(' | ')]);
      if (b.grams_per_unit) await tx.query('UPDATE food SET grams_per_unit = $2 WHERE id = $1', [id, b.grams_per_unit]);
      if (b.tags) { await tx.query('DELETE FROM food_tag WHERE food_id = $1', [id]); for (const t of b.tags) await tx.query(`INSERT INTO food_tag (food_id, tag, source) VALUES ($1,$2,'user')`, [id, t]); }
      return { ok: true };
    });
  });
  /** Merge a duplicate (an LLM- or user-created food) into a canonical one; rewrites meal_item.food_id. */
  app.post('/foods/:id/merge', async (req) => {
    const id = (req.params as { id: string }).id;
    const { into } = z.object({ into: z.string().uuid() }).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      const own = await tx.query('SELECT 1 FROM food WHERE id = $1 AND created_by = app_current_user()', [id]);
      if (!own.rows[0]) throw new HttpProblem(403, 'not_editable', 'Only foods you created can be merged away');
      const n = (await tx.query('UPDATE meal_item SET food_id = $2 WHERE food_id = $1', [id, into])).rowCount;
      await tx.query('UPDATE user_food_alias SET food_id = $2 WHERE food_id = $1', [id, into]);
      const uf = await tx.query<{ times_logged: number }>('SELECT times_logged FROM user_food WHERE food_id = $1', [id]);
      await tx.query(`INSERT INTO user_food (user_id, food_id, times_logged) VALUES (app_current_user(), $1, $2) ON CONFLICT (user_id, food_id) DO UPDATE SET times_logged = user_food.times_logged + EXCLUDED.times_logged`, [into, uf.rows[0]?.times_logged ?? 0]);
      await tx.query('DELETE FROM user_food WHERE food_id = $1', [id]);
      await tx.query('UPDATE food SET merged_into = $2 WHERE id = $1', [id, into]);
      return { merged: true, meal_items_rewritten: n };
    });
  });
  app.get('/foods/:id/components', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const id = (req.params as { id: string }).id;
    const { rows } = await tx.query(`WITH RECURSIVE w(id, depth, fraction, path) AS (
        SELECT $1::uuid, 0, 1.0::numeric, ARRAY[$1::uuid]
        UNION ALL SELECT fc.component_food_id, w.depth + 1, w.fraction * coalesce(fc.fraction, 0), w.path || fc.component_food_id
        FROM w JOIN food_component fc ON fc.parent_food_id = w.id WHERE w.depth < 3 AND NOT fc.component_food_id = ANY(w.path))
      SELECT w.id AS food_id, f.canonical_name, w.depth, w.fraction, w.path FROM w JOIN food f ON f.id = w.id WHERE w.depth > 0 ORDER BY w.depth, f.canonical_name`, [id]);
    return { components: rows, depth: Math.max(0, ...rows.map((r: { depth: number }) => r.depth)), has_cycle: false };
  }));
  app.put('/foods/:id/components', async (req) => {
    const id = (req.params as { id: string }).id;
    const b = z.array(z.object({ food_id: z.string().uuid(), fraction: z.number().gt(0).max(1).nullable().optional(), is_optional: z.boolean().optional() })).max(30).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      const own = await tx.query('SELECT 1 FROM food WHERE id = $1 AND created_by = app_current_user()', [id]);
      if (!own.rows[0]) throw new HttpProblem(403, 'not_editable', 'Only foods you created can have their ingredients changed');
      try { await setComponents(tx, id, b); } catch (e) { throw new HttpProblem(422, 'validation', 'These ingredients are not allowed', (e as Error).message); }
      return { ok: true };
    });
  });
  /** Tags including inherited ones, each with `via` so the UI can explain why (03 §17.6). */
  app.get('/foods/:id/tags', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const id = (req.params as { id: string }).id;
    const { rows } = await tx.query(`WITH RECURSIVE w(id, depth, path) AS (
        SELECT $1::uuid, 0, ARRAY[$1::uuid] UNION ALL
        SELECT fc.component_food_id, w.depth + 1, w.path || fc.component_food_id FROM w JOIN food_component fc ON fc.parent_food_id = w.id WHERE w.depth < 3 AND NOT fc.component_food_id = ANY(w.path))
      SELECT ft.tag, min(w.depth) AS depth, (array_agg(w.path ORDER BY w.depth))[1] AS via FROM w JOIN food_tag ft ON ft.food_id = w.id GROUP BY ft.tag ORDER BY ft.tag`, [id]);
    return { data: rows.map((r: { tag: string; depth: number; via: string[] }) => ({ tag: r.tag, inherited: r.depth > 0, via: r.via.slice(1) })), total: rows.length };
  }));
}

async function setComponents(tx: import('../db/pool.js').Tx, id: string, comps: { food_id: string; fraction?: number | null; is_optional?: boolean }[]) {
  await tx.query('DELETE FROM food_component WHERE parent_food_id = $1', [id]);
  for (const [i, c] of comps.entries()) await tx.query(`INSERT INTO food_component (parent_food_id, component_food_id, fraction, is_optional, source, position) VALUES ($1,$2,$3,$4,'user',$5)`, [id, c.food_id, c.fraction ?? null, c.is_optional ?? false, i]);
}
