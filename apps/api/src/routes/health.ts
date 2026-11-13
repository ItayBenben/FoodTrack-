import type { FastifyInstance } from 'fastify';
import { isInternalRequest } from '../lib/net.js';
import { HttpProblem } from '../lib/problem.js';

export async function healthRoutes(app: FastifyInstance) {
  const { deps } = app;
  // Liveness only — no version, no dependency list (06 §5.5).
  const live = async () => ({ status: 'ok' });
  app.get('/health', live);
  app.get('/api/v1/health', live);

  // Readiness detail is internal-network only; Caddy never routes it.
  app.get('/health/ready', async (req, reply) => {
    if (!isInternalRequest(req.ip, req.headers, deps.env.INTERNAL_NETWORK_CIDRS)) {
      throw new HttpProblem(404, 'not_found', 'Not found');
    }
    const checks: Record<string, string> = {};
    try { await deps.db.query('SELECT 1'); checks.postgres = 'ok'; } catch { checks.postgres = 'down'; }
    checks.media = (await deps.media.ready()) ? 'ok' : 'down';
    try {
      const r = await fetch(`${deps.env.ANALYSIS_URL}/health`, { signal: AbortSignal.timeout(2000) });
      checks.analysis = r.ok ? 'ok' : 'down';
    } catch { checks.analysis = 'down'; }
    try {
      const { rows } = await deps.db.query<{ n: number }>("SELECT count(*)::int AS n FROM job WHERE status = 'queued' AND run_after < now() - interval '10 minutes'");
      checks.jobs = (rows[0]?.n ?? 0) > 100 ? 'backlogged' : 'ok';
    } catch { checks.jobs = 'unknown'; }
    checks.llm = deps.llm.describe().active;
    checks.encryption = 'on';
    const ok = checks.postgres === 'ok' && checks.media === 'ok';
    return reply.status(ok ? 200 : 503).send({ status: ok ? 'ready' : 'degraded', checks });
  });
}
