import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { requireAuth } from './guard.js';
import { trackerRoutes } from './trackers.js';
import { observationRoutes } from './observations.js';
import { syncRoutes } from './sync.js';
import { meRoutes } from './me.js';
import { eventRoutes } from './events.js';
import { mealRoutes } from './meals.js';
import { dayBuilderRoutes } from './day-builder.js';
import { mediaRoutes } from './media.js';

/** Route groups added by later milestones register here. */
export const protectedGroups: ((app: FastifyInstance) => Promise<void>)[] = [];

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth);
    await scope.register(trackerRoutes);
    await scope.register(observationRoutes);
    await scope.register(syncRoutes);
    await scope.register(meRoutes);
    await scope.register(eventRoutes);
    await scope.register(mealRoutes);
    await scope.register(dayBuilderRoutes);
    await scope.register(mediaRoutes);
    for (const g of protectedGroups) await scope.register(g);
  }, { prefix: '/api/v1' });
}
