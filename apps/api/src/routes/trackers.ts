import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contentHash, parseTrackerDefinition, TrackerDefinitionError } from '@foodtrack/tracker-schema';
import { withUser } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { applyPack, removePack } from '../services/trackers.js';

export async function trackerRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.get('/trackers', async (req, reply) => withUser(deps.db, req.userId, async (tx) => {
    const reg = await deps.registry.forUser(tx);
    const data = [...reg.values()].map((t) => ({ key: t.def.key, content_hash: t.hash, custom: t.custom, definition: t.def }));
    const etag = `"${contentHash(data.map((d) => d.content_hash))}"`;
    reply.header('ETag', etag).header('Cache-Control', 'private, max-age=0, must-revalidate');
    if (req.headers['if-none-match'] === etag) return reply.status(304).send();
    return { data, total: data.length };
  }));
  app.get('/trackers/:key', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const t = await deps.registry.get(tx, (req.params as { key: string }).key);
    if (!t) throw notFound('tracker');
    return { key: t.def.key, content_hash: t.hash, custom: t.custom, definition: t.def };
  }));
  app.get('/me/trackers', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query('SELECT tracker_key, enabled, sort_order, settings FROM user_tracker ORDER BY sort_order, tracker_key');
    return { data: rows, total: rows.length };
  }));
  app.put('/me/trackers', async (req) => {
    const body = z.array(z.object({ tracker_key: z.string(), enabled: z.boolean(), sort_order: z.number().int().optional(), settings: z.record(z.string(), z.unknown()).optional() })).max(200).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      const reg = await deps.registry.forUser(tx);
      for (const t of body) {
        if (!reg.has(t.tracker_key)) throw new HttpProblem(422, 'validation', `Unknown tracker '${t.tracker_key}'`);
        await tx.query(`INSERT INTO user_tracker (user_id, tracker_key, enabled, sort_order, settings) VALUES (app_current_user(), $1, $2, coalesce($3, 100), coalesce($4, '{}'))
          ON CONFLICT (user_id, tracker_key) DO UPDATE SET enabled = EXCLUDED.enabled, sort_order = coalesce($3, user_tracker.sort_order), settings = coalesce($4, user_tracker.settings)`,
          [t.tracker_key, t.enabled, t.sort_order ?? null, t.settings ?? null]);
      }
      const { rows } = await tx.query('SELECT tracker_key, enabled, sort_order, settings FROM user_tracker ORDER BY sort_order, tracker_key');
      return { data: rows, total: rows.length };
    });
  });
  app.get('/packs', async () => ({ data: deps.registry.packs, total: deps.registry.packs.length }));
  app.get('/me/packs', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ tracker_key: string }>('SELECT tracker_key FROM user_tracker WHERE enabled');
    const on = new Set(rows.map((r) => r.tracker_key));
    const data = deps.registry.packs.map((p) => ({ ...p, active: p.trackers.every((t) => on.has(t)) }));
    return { data, total: data.length };
  }));
  app.post('/me/packs/:key/apply', async (req) => withUser(deps.db, req.userId, async (tx) => ({ pack: await applyPack(tx, deps, (req.params as { key: string }).key) })));
  app.post('/me/packs/:key/remove', async (req) => withUser(deps.db, req.userId, (tx) => removePack(tx, deps, (req.params as { key: string }).key)));

  // User-authored trackers (D15): same meta-schema, key prefixed u_, version-bumping on edit.
  const custom = async (userId: string, key: string | null, raw: unknown) => {
    let def;
    try { def = parseTrackerDefinition(raw, 'custom tracker'); } catch (e) {
      if (e instanceof TrackerDefinitionError) throw new HttpProblem(422, 'validation', 'This tracker definition is not valid', e.issues.join('; '), e.issues.map((m) => ({ path: m.split(':')[0]!, code: 'invalid', message: m })));
      throw e;
    }
    if (!def.key.startsWith('u_')) throw new HttpProblem(422, 'validation', 'Custom tracker keys start with u_');
    if (key && def.key !== key) throw new HttpProblem(422, 'validation', 'The key of a tracker never changes');
    return withUser(deps.db, userId, async (tx) => {
      const prev = (await tx.query<{ version: number }>('SELECT version FROM user_tracker_definition WHERE key = $1', [def.key])).rows[0];
      if (!key && prev) throw new HttpProblem(409, 'exists', 'A tracker with that key already exists');
      if (key && !prev) throw notFound('custom tracker');
      const version = prev ? prev.version + 1 : 1;
      const next = { ...def, version };
      await tx.query(`INSERT INTO user_tracker_definition (user_id, key, version, content_hash, definition) VALUES (app_current_user(), $1, $2, $3, $4)
        ON CONFLICT (user_id, key) DO UPDATE SET version = EXCLUDED.version, content_hash = EXCLUDED.content_hash, definition = EXCLUDED.definition, deleted_at = NULL`,
        [def.key, version, contentHash(next), next]);
      await tx.query(`INSERT INTO user_tracker (user_id, tracker_key, enabled) VALUES (app_current_user(), $1, true) ON CONFLICT DO NOTHING`, [def.key]);
      return { key: def.key, version, content_hash: contentHash(next), definition: next };
    });
  };
  app.post('/me/trackers/custom', async (req, reply) => reply.status(201).send(await custom(req.userId, null, req.body)));
  app.patch('/me/trackers/custom/:key', async (req) => custom(req.userId, (req.params as { key: string }).key, req.body));
  app.delete('/me/trackers/custom/:key', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const k = (req.params as { key: string }).key;
    await tx.query('UPDATE user_tracker_definition SET deleted_at = now() WHERE key = $1', [k]);
    await tx.query('UPDATE user_tracker SET enabled = false WHERE tracker_key = $1', [k]);
    return { ok: true, data_kept: true };
  }));
}
