import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { API_VERSION } from '@foodtrack/shared';
import type { AnalysisConfig, Env } from './config.js';
import type { Db } from './db/pool.js';
import type { LoadedKeys } from './crypto/keys.js';
import type { TrackerRegistry } from './registry.js';
import { HttpProblem } from './lib/problem.js';
import { EventBus } from './lib/events.js';
import type { LLMRouter } from './llm/router.js';
import type { MediaStore } from './services/media-store.js';
import { registerRoutes } from './routes/index.js';

export interface Deps {
  env: Env;
  db: Db;
  registry: TrackerRegistry;
  keys: LoadedKeys;
  analysis: AnalysisConfig;
  llm: LLMRouter;
  media: MediaStore;
  events: EventBus;
}

declare module 'fastify' {
  interface FastifyInstance { deps: Deps }
  interface FastifyRequest { userId: string; sessionId: string }
}

export async function buildApp(deps: Deps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.env.NODE_ENV === 'test' ? false : { level: deps.env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    genReqId: () => crypto.randomUUID(),
  });
  app.decorate('deps', deps);
  app.decorateRequest('userId', '');
  app.decorateRequest('sessionId', '');
  await app.register(cookie, { secret: deps.env.SESSION_SECRET });
  await app.register(rateLimit, {
    global: true, max: 600, timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => req.userId || req.ip,
    errorResponseBuilder: (_req, ctx) => new HttpProblem(429, 'rate_limited', 'Too many requests',
      `Slow down — try again in ${Math.ceil(ctx.ttl / 1000)} s. Nothing you saved was lost; offline entries stay queued on your device.`).toJSON(),
  });
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 4 } });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-API-Version', API_VERSION);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', reply.getHeader('Cache-Control') ?? 'no-store');
  });

  // CSRF (06 §5): state-changing requests must come from our own origin.
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && origin !== deps.env.PUBLIC_ORIGIN && deps.env.NODE_ENV === 'production') {
      throw new HttpProblem(403, 'csrf', 'Cross-origin request refused', 'This request did not come from the FoodTrack app.');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpProblem) return reply.status(err.status).type('application/problem+json').send(err.toJSON());
    if (err instanceof ZodError) {
      const errors = err.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: `${i.path.join('.') || 'body'}: ${i.message}` }));
      return reply.status(422).type('application/problem+json').send(new HttpProblem(422, 'validation', 'Invalid request', errors.map((e) => e.message).join('; '), errors).toJSON());
    }
    if ((err as { code?: string }).code === '22P02') {
      return reply.status(404).type('application/problem+json').send(new HttpProblem(404, 'not_found', 'Not found', 'No such item for this account.').toJSON());
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'unhandled');
    const detail = status >= 500
      ? 'The server hit an unexpected error. Your entry is still saved on this device and will retry automatically.'
      : (err as Error).message;
    return reply.status(status).type('application/problem+json').send(new HttpProblem(status, status >= 500 ? 'internal' : 'request', status >= 500 ? 'Server error' : 'Bad request', detail).toJSON());
  });

  await registerRoutes(app);
  return app;
}

export { EventBus };
