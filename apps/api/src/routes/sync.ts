import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MutationSchema, type Mutation } from '@foodtrack/shared';
import { pull, push, type PushResult } from '../services/sync.js';

/** The envelope is validated as a whole; each mutation on its own, so one malformed row is rejected with a
 *  reason instead of failing the whole batch with a 422 that the client would retry forever (03 §8). */
const PushEnvelope = z.object({ device_id: z.string().min(3).max(100), mutations: z.array(z.unknown()).max(500) });

export async function syncRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.post('/sync/push', async (req) => {
    const b = PushEnvelope.parse(req.body);
    const valid: Mutation[] = [];
    const invalid: PushResult['rejected'] = [];
    for (const raw of b.mutations) {
      const m = MutationSchema.safeParse(raw);
      if (m.success) { valid.push(m.data); continue; }
      const cid = (raw as { client_id?: unknown } | null)?.client_id;
      const errors = m.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: `${i.path.join('.') || 'mutation'}: ${i.message}` }));
      invalid.push({ client_id: typeof cid === 'string' ? cid : '', reason: 'validation', detail: errors.map((e) => e.message).join('; '), errors });
    }
    const res = await push(deps, req.userId, b.device_id, valid);
    res.rejected.unshift(...invalid);
    return res;
  });
  app.get('/sync/pull', async (req) => {
    const q = z.object({ since: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(500), device_id: z.string().min(3).max(100).default('unknown') }).parse(req.query);
    return pull(deps, req.userId, q.device_id, q.since, q.limit);
  });
}
