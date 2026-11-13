import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SyncPushSchema } from '@foodtrack/shared';
import { pull, push } from '../services/sync.js';

export async function syncRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.post('/sync/push', async (req) => {
    const b = SyncPushSchema.parse(req.body);
    return push(deps, req.userId, b.device_id, b.mutations);
  });
  app.get('/sync/pull', async (req) => {
    const q = z.object({ since: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(500), device_id: z.string().min(3).max(100).default('unknown') }).parse(req.query);
    return pull(deps, req.userId, q.device_id, q.since, q.limit);
  });
}
