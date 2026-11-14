import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withUser } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';

export async function pushRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.get('/push/vapid-key', async () => {
    if (!deps.env.VAPID_PUBLIC_KEY) throw new HttpProblem(404, 'push_not_configured', 'Reminders by notification are not set up on this server', 'The server operator can generate keys with `pnpm --filter @foodtrack/api vapid`. In-app reminders still work.');
    return { key: deps.env.VAPID_PUBLIC_KEY };
  });
  app.post('/push/subscribe', async (req, reply) => {
    const b = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }), device_label: z.string().max(80).optional() }).parse(req.body);
    await withUser(deps.db, req.userId, (tx) => tx.query(`INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, device_label) VALUES (app_current_user(), $1, $2, $3, $4)
      ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`, [b.endpoint, b.keys.p256dh, b.keys.auth, b.device_label ?? null]));
    return reply.status(201).send({ ok: true });
  });
  app.delete('/push/subscribe', async (req) => {
    const b = z.object({ endpoint: z.string() }).parse(req.body);
    await withUser(deps.db, req.userId, (tx) => tx.query('DELETE FROM push_subscription WHERE endpoint = $1', [b.endpoint]));
    return { ok: true };
  });
}
