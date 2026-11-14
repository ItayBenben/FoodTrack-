import type { FastifyInstance } from 'fastify';
import type { AppEvent } from '../lib/events.js';

/** SSE (03 §11). Auth via short-lived access token in the query string. */
export async function eventRoutes(app: FastifyInstance) {
  app.get('/events', async (req, reply) => {
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    reply.raw.write(': connected\n\n');
    const onEvent = (e: AppEvent) => { if (e.user_id === req.userId) reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`); };
    app.deps.events.on('event', onEvent);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => { clearInterval(ping); app.deps.events.off('event', onEvent); });
    return reply.hijack();
  });
}
