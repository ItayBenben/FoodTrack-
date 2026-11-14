import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withUser } from '../db/pool.js';
import { HttpProblem, notFound } from '../lib/problem.js';
import { clinicalSummary, importData, verifyDownload } from '../services/export.js';

const DateS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function exportRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.post('/export', async (req, reply) => {
    const b = z.object({ format: z.enum(['json', 'csv']), from: DateS, to: DateS }).parse(req.body);
    const id = await withUser(deps.db, req.userId, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(`INSERT INTO job (kind, user_id, payload) VALUES ('export', app_current_user(), '{}') RETURNING id`);
      await tx.query(`UPDATE job SET payload = $2 WHERE id = $1`, [rows[0]!.id, { ...b, job_id: rows[0]!.id }]);
      return rows[0]!.id;
    });
    return reply.status(202).send({ job_id: id });
  });
  app.get('/export/:id', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query<{ status: string; result: { url: string; expires_at: number } | null; error: string | null }>(`SELECT status, result, error FROM job WHERE id = $1 AND kind = 'export'`, [(req.params as { id: string }).id]);
    if (!rows[0]) throw notFound('export');
    return { status: rows[0].status, url: rows[0].result?.url ?? null, expires_at: rows[0].result?.expires_at ?? null, error: rows[0].error,
      note: 'unencrypted_file' };
  }));
  app.get('/export/clinical', async (req) => {
    const q = z.object({ from: DateS, to: DateS }).parse(req.query);
    return withUser(deps.db, req.userId, (tx) => clinicalSummary(tx, deps, q.from, q.to));
  });
  app.post('/import', { bodyLimit: 30 * 1024 * 1024 }, async (req) => {
    const q = z.object({ dry_run: z.coerce.boolean().default(true) }).parse(req.query);
    return withUser(deps.db, req.userId, (tx) => importData(tx, deps, req.body, q.dry_run));
  });
}

/** The download is a plain link (no bearer header): the HMAC signature binds job, user and expiry. */
export async function exportPublicRoutes(app: FastifyInstance) {
  const { deps } = app;
  /** One-time, signed, short-lived download (02 §9.5). */
  app.get('/export/:id/download', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const q = z.object({ u: z.string().uuid(), exp: z.coerce.number(), sig: z.string() }).parse(req.query);
    if (!verifyDownload(deps, id, q.u, q.exp, q.sig)) throw new HttpProblem(410, 'expired', 'This download link has expired', 'Export again — links last an hour and work once.');
    const row = await withUser(deps.db, q.u, async (tx) => (await tx.query<{ result: { key: string; wrapped: string; nonce: string; mime: string; ext: string } }>(`SELECT result FROM job WHERE id = $1 AND kind = 'export' AND status = 'done'`, [id])).rows[0]);
    if (!row?.result) throw new HttpProblem(410, 'expired', 'Already downloaded', 'Each export downloads once. Export again if you need it.');
    const plain = deps.keys.crypto.openMedia(id, await deps.media.get(row.result.key), Buffer.from(row.result.wrapped, 'base64'), Buffer.from(row.result.nonce, 'base64'));
    await deps.media.delete(row.result.key);
    await withUser(deps.db, q.u, (tx) => tx.query(`UPDATE job SET result = NULL WHERE id = $1`, [id]));
    return reply.header('Content-Disposition', `attachment; filename="foodtrack-export.${row.result.ext}"`).header('Cache-Control', 'no-store').type(row.result.mime).send(plain);
  });
}
