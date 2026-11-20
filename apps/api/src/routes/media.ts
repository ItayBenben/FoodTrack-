/**
 * Photos (D14): encrypted with a per-object key before they touch disk, served only through
 * this user-scoped route, never cached by shared caches. Sent to a vision model only if enabled.
 */
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { uuidv7 } from '@foodtrack/shared';
import { withUser } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { getUser } from '../services/users.js';
import { MealParser } from '../services/meal-parse.js';
import { VISION_MIMES } from '../services/media-types.js';

const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function mediaRoutes(app: FastifyInstance) {
  const { deps } = app;
  const store = async (userId: string, buf: Buffer, mime: string) => {
    if (!MIMES.has(mime)) throw new HttpProblem(415, 'unsupported_media', 'That file type isn’t supported', 'Use a JPEG, PNG, WebP or HEIC photo.');
    const id = uuidv7();
    const sealed = deps.keys.crypto.sealMedia(id, buf);
    const key = `${userId}/${id}`;
    await deps.media.put(key, sealed.ciphertext);
    await withUser(deps.db, userId, (tx) => tx.query(`INSERT INTO media (id, user_id, storage_key, mime, bytes, sha256, object_key_wrapped, nonce, uploaded_at)
      VALUES ($1, app_current_user(), $2, $3, $4, $5, $6, $7, now())`, [id, key, mime, buf.length, createHash('sha256').update(buf).digest('hex'), sealed.wrappedKey, sealed.nonce]));
    return id;
  };
  app.post('/media', async (req, reply) => {
    const file = await req.file(); if (!file) throw new HttpProblem(422, 'validation', 'No file uploaded');
    const id = await store(req.userId, await file.toBuffer(), file.mimetype);
    return reply.status(201).send({ media_id: id });
  });
  app.get('/media/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = await withUser(deps.db, req.userId, async (tx) => (await tx.query<{ storage_key: string; mime: string; object_key_wrapped: Buffer; nonce: Buffer }>('SELECT storage_key, mime, object_key_wrapped, nonce FROM media WHERE id = $1', [id])).rows[0]);
    if (!row) throw notFound('photo');
    const plain = deps.keys.crypto.openMedia(id, await deps.media.get(row.storage_key), row.object_key_wrapped, row.nonce);
    return reply.header('Cache-Control', 'private, no-store').type(row.mime).send(plain);
  });
  app.delete('/media/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ storage_key: string }>('DELETE FROM media WHERE id = $1 RETURNING storage_key', [(req.params as { id: string }).id]);
    if (rows[0]) await deps.media.delete(rows[0].storage_key);
    return { ok: true };
  }));
  app.post('/meals/parse-photo', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const file = await req.file(); if (!file) throw new HttpProblem(422, 'validation', 'No photo uploaded');
    const buf = await file.toBuffer();
    const media_id = await store(req.userId, buf, file.mimetype);
    if (!deps.llm.describe().vision) return { media_id, items: [], vision: 'off' };
    if (!VISION_MIMES.has(file.mimetype)) return { media_id, items: [], vision: 'unavailable' };
    const locale = await withUser(deps.db, req.userId, async (tx) => (await getUser(tx)).locale);
    const r = await deps.llm.parsePhoto({ image: buf, mime: file.mimetype, locale });
    if (r.degraded) return { media_id, items: [], vision: 'unavailable' };
    const items = await withUser(deps.db, req.userId, (tx) => new MealParser(tx, deps, locale).resolveVision(r.items, media_id));
    return { media_id, items, vision: 'on' };
  });
}
