import type { FastifyReply, FastifyRequest } from 'fastify';
import { assertSessionLive, verifyAccess } from '../services/auth.js';
import { HttpProblem } from '../lib/problem.js';

/** preHandler: every /api/v1 route except /auth/* and /health requires a valid access token. */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const h = req.headers.authorization;
  const q = (req.query as Record<string, string> | undefined)?.access_token;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : q;
  if (!token) throw new HttpProblem(401, 'unauthenticated', 'Not signed in', 'Unlock to continue. Anything you logged is still saved on this device.');
  const { userId, sessionId } = await verifyAccess(req.server.deps, token);
  await assertSessionLive(req.server.deps, userId, sessionId);
  req.userId = userId; req.sessionId = sessionId;
}

export function deviceId(req: FastifyRequest): string | null {
  const d = req.headers['x-device-id'];
  return typeof d === 'string' && /^[\w-]{3,100}$/.test(d) ? d : null;
}
