/** Security endpoints (03 §14). Card reprint needs re-authentication, is rate-limited and audited; never a downloadable file. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verify } from '@node-rs/argon2';
import { withUser } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';
import { checksum, parseKek, parseRecoveryCard, recoveryCard, unwrapDek } from '../crypto/envelope.js';

export async function securityRoutes(app: FastifyInstance) {
  const { deps } = app;
  const wrapped = async () => (await deps.db.query<{ dek_wrapped: Buffer; created_at: Date }>('SELECT dek_wrapped, created_at FROM crypto_key WHERE id = 1')).rows[0]!;
  app.post('/security/recovery-card', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (req, reply) => {
    const b = z.object({ passphrase: z.string().min(1) }).parse(req.body);
    await withUser(deps.db, req.userId, async (tx) => {
      const { rows } = await tx.query<{ password_hash: string }>('SELECT password_hash FROM app_user WHERE id = app_current_user()');
      if (!(await verify(rows[0]!.password_hash, b.passphrase).catch(() => false))) throw new HttpProblem(401, 'bad_credentials', 'That passphrase didn’t work', 'The card was not shown.');
      await tx.query(`INSERT INTO security_audit (user_id, action, detail, ip) VALUES (app_current_user(), 'recovery_card_shown', '{}', $1)`, [req.ip]);
    });
    const w = await wrapped();
    return reply.header('Cache-Control', 'no-store').type('text/plain; charset=utf-8').send(recoveryCard(parseKek(deps.env.FOODTRACK_KEK), new Uint8Array(w.dek_wrapped), w.created_at));
  });
  app.post('/security/verify-card', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const b = z.object({ card: z.string().min(20).max(4000) }).parse(req.body);
    const w = await wrapped();
    let valid = false;
    try { const c = parseRecoveryCard(b.card); unwrapDek(c.kek, new Uint8Array(w.dek_wrapped)); valid = checksum(c.kek, new Uint8Array(w.dek_wrapped)) === c.check; } catch { valid = false; }
    await withUser(deps.db, req.userId, (tx) => tx.query(`INSERT INTO security_audit (user_id, action, detail, ip) VALUES (app_current_user(), 'recovery_card_verified', $1, $2)`, [{ valid }, req.ip]));
    return { valid };
  });
}
