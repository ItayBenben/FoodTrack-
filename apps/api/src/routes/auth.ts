import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CredentialsSchema, SetupSchema, UnlockSchema } from '@foodtrack/shared';
import { anonymous, withUser } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';
import { isInternalRequest } from '../lib/net.js';
import { REFRESH_COOKIE, REFRESH_TTL_DAYS, changePassphrase, consumeResetToken, createAccount, createResetToken, login, logout, refresh, unlock, type Tokens, base32, verifyTotpForUser, sha } from '../services/auth.js';
import { applyPack } from '../services/trackers.js';
import { requireAuth } from './guard.js';
import { getUser } from '../services/users.js';
import { randomBytes } from 'node:crypto';

const label = (req: FastifyRequest) => String(req.headers['user-agent'] ?? '').slice(0, 120) || null;

function sendTokens(app: FastifyInstance, reply: FastifyReply, t: Tokens, extra: Record<string, unknown> = {}) {
  reply.setCookie(REFRESH_COOKIE, t.refresh_token, {
    httpOnly: true, sameSite: 'strict', secure: app.deps.env.NODE_ENV === 'production', path: '/api/v1/auth', maxAge: REFRESH_TTL_DAYS * 86400,
  });
  return { access_token: t.access_token, expires_in: t.expires_in, token_type: 'Bearer', ...extra };
}

export async function authRoutes(app: FastifyInstance) {
  const { deps } = app;
  const strict = { config: { rateLimit: { max: deps.env.AUTH_RATE_LIMIT_PER_MIN, timeWindow: '1 minute', keyGenerator: (r: FastifyRequest) => r.ip } } };

  app.get('/auth/status', async () => {
    const n = await anonymous(deps.db, async (tx) => Number((await tx.query<{ n: string }>('SELECT auth_count_users() AS n')).rows[0]!.n));
    return { mode: deps.env.AUTH_MODE, set_up: n > 0, registration_open: deps.env.AUTH_MODE === 'multi' };
  });

  /** First run (single-user) or register (multi-user): creates the account, applies the chosen pack and settings. */
  app.post('/auth/setup', strict, async (req, reply) => {
    const body = SetupSchema.extend({
      email: z.string().email().optional(),
      pack: z.string().optional(), trackers: z.array(z.string()).optional(),
      day_rollover: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      units: z.record(z.string(), z.string()).optional(),
      profile: z.object({ birth_year: z.number().int().min(1900).max(2100).nullable().optional(), sex_at_birth: z.string().max(20).nullable().optional(), height_cm: z.number().min(50).max(260).nullable().optional() }).optional(),
      reminders: z.object({ checkin_at: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), meal_nudges: z.boolean().optional(), quiet_from: z.string().optional(), quiet_to: z.string().optional() }).optional(),
      disclaimer_accepted: z.boolean().optional(),
    }).parse(req.body);
    const { userId, tokens } = await createAccount(deps, { email: body.email ?? null, secret: body.passphrase, display_name: body.display_name, locale: body.locale, timezone: body.timezone }, req.ip, label(req));
    await withUser(deps.db, userId, async (tx) => {
      if (body.day_rollover) await tx.query('UPDATE app_user SET day_rollover = $1 WHERE id = app_current_user()', [body.day_rollover]);
      if (body.units) await tx.query('UPDATE app_user SET units = $1 WHERE id = app_current_user()', [body.units]);
      if (body.disclaimer_accepted) await tx.query('UPDATE app_user SET disclaimer_accepted_at = now() WHERE id = app_current_user()');
      if (body.profile) await tx.query('UPDATE user_profile SET birth_year = $1, sex_at_birth = $2, height_cm = $3 WHERE user_id = app_current_user()',
        [body.profile.birth_year ?? null, body.profile.sex_at_birth ?? null, body.profile.height_cm ?? null]);
      if (body.reminders) {
        if (body.reminders.checkin_at !== undefined) await tx.query(`UPDATE reminder_pref SET enabled = $1, at_time = coalesce($2::time, at_time) WHERE kind = 'checkin'`, [body.reminders.checkin_at !== null, body.reminders.checkin_at]);
        if (body.reminders.meal_nudges !== undefined) await tx.query(`UPDATE reminder_pref SET enabled = $1 WHERE kind = 'meal_nudge'`, [body.reminders.meal_nudges]);
        if (body.reminders.quiet_from) await tx.query('UPDATE app_user SET quiet_from = $1, quiet_to = $2 WHERE id = app_current_user()', [body.reminders.quiet_from, body.reminders.quiet_to ?? '07:30']);
      }
      const packs = body.pack ? [body.pack] : deps.registry.packs.filter((p) => p.default_enabled).map((p) => p.key);
      for (const p of packs) await applyPack(tx, deps, p);
      if (body.trackers) {
        await tx.query('UPDATE user_tracker SET enabled = (tracker_key = ANY($1::text[]))', [body.trackers]);
        for (const [i, k] of body.trackers.entries()) await tx.query(`INSERT INTO user_tracker (user_id, tracker_key, enabled, sort_order) VALUES (app_current_user(), $1, true, $2) ON CONFLICT (user_id, tracker_key) DO UPDATE SET enabled = true`, [k, (i + 1) * 10]);
      }
      await tx.query('UPDATE app_user SET onboarded_at = now() WHERE id = app_current_user()');
    });
    return reply.status(201).send(sendTokens(app, reply, tokens, { user_id: userId }));
  });

  app.post('/auth/unlock', strict, async (req, reply) => {
    const b = UnlockSchema.extend({ totp: z.string().max(20).optional() }).parse(req.body);
    return sendTokens(app, reply, await unlock(deps, b.passphrase, req.ip, label(req), b.totp));
  });
  app.post('/auth/login', strict, async (req, reply) => {
    const b = CredentialsSchema.extend({ password: z.string().min(1).max(256), totp: z.string().max(20).optional() }).parse(req.body);
    return sendTokens(app, reply, await login(deps, b.email, b.password, req.ip, label(req), b.totp));
  });
  app.post('/auth/register', strict, async (req, reply) => {
    if (deps.env.AUTH_MODE !== 'multi') throw new HttpProblem(404, 'not_found', 'Registration is off', 'This instance is single-user.');
    const b = CredentialsSchema.parse(req.body);
    const { userId, tokens } = await createAccount(deps, { email: b.email, secret: b.password, locale: 'he-IL', timezone: 'Asia/Jerusalem' }, req.ip, label(req));
    await withUser(deps.db, userId, async (tx) => { for (const p of deps.registry.packs.filter((x) => x.default_enabled)) await applyPack(tx, deps, p.key); });
    return reply.status(201).send(sendTokens(app, reply, tokens, { user_id: userId }));
  });
  app.post('/auth/refresh', async (req, reply) => {
    try { return sendTokens(app, reply, await refresh(deps, req.cookies[REFRESH_COOKIE])); }
    catch (e) { reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' }); throw e; }
  });
  app.post('/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    await logout(deps, req.userId, req.sessionId);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  });
  app.get('/auth/me', { preHandler: requireAuth }, async (req) => withUser(deps.db, req.userId, async (tx) => {
    const user = await getUser(tx);
    const { rows: profile } = await tx.query('SELECT birth_year, sex_at_birth, height_cm, goals FROM user_profile');
    const { rows: trackers } = await tx.query('SELECT tracker_key, enabled, sort_order, settings FROM user_tracker ORDER BY sort_order, tracker_key');
    return { user, profile: profile[0] ?? null, trackers };
  }));
  app.post('/auth/change-passphrase', { preHandler: requireAuth, ...strict }, async (req) => {
    const b = z.object({ current: z.string().min(1), next: z.string().min(12).max(256) }).parse(req.body);
    await changePassphrase(deps, req.userId, req.sessionId, b.current, b.next, req.ip);
    return { ok: true, other_sessions_revoked: true };
  });
  app.get('/auth/sessions', { preHandler: requireAuth }, async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT DISTINCT ON (family_id) family_id AS id, device_label, created_at, last_used_at, (family_id = (SELECT family_id FROM auth_session WHERE id = $1)) AS current
      FROM auth_session WHERE revoked_at IS NULL AND expires_at > now() ORDER BY family_id, created_at DESC`, [req.sessionId]);
    return { data: rows, total: rows.length };
  }));
  app.delete('/auth/sessions/:id', { preHandler: requireAuth }, async (req) => withUser(deps.db, req.userId, async (tx) => {
    await tx.query('UPDATE auth_session SET revoked_at = now() WHERE family_id = $1', [(req.params as { id: string }).id]);
    return { ok: true };
  }));

  // TOTP 2FA, with 10 single-use recovery codes shown once.
  app.post('/auth/totp/enroll', { preHandler: requireAuth }, async (req) => withUser(deps.db, req.userId, async (tx) => {
    const secret = base32(randomBytes(20));
    const codes = Array.from({ length: 10 }, () => randomBytes(5).toString('hex'));
    await tx.query('UPDATE app_user SET totp_recovery = $1 WHERE id = app_current_user()', [JSON.stringify([])]);
    await tx.query(`INSERT INTO security_audit (user_id, action, detail) VALUES (app_current_user(), 'totp_enroll_started', '{}')`);
    const pending = deps.keys.crypto.seal('totp_pending', 'secret', req.userId, JSON.stringify({ secret, codes })).toString('base64');
    return { secret, otpauth_url: `otpauth://totp/FoodTrack?secret=${secret}&issuer=FoodTrack&digits=6&period=30`, recovery_codes: codes, pending };
  }));
  app.post('/auth/totp/verify', { preHandler: requireAuth }, async (req) => {
    const b = z.object({ code: z.string().length(6), pending: z.string() }).parse(req.body);
    const { secret, codes } = JSON.parse(deps.keys.crypto.open('totp_pending', 'secret', req.userId, Buffer.from(b.pending, 'base64'))!) as { secret: string; codes: string[] };
    const { totpAt } = await import('../services/auth.js');
    if (![-1, 0, 1].some((s) => totpAt(secret, Date.now(), s) === b.code)) throw new HttpProblem(422, 'totp_invalid', 'That code didn’t match', 'Check the time on your phone and try the next code.');
    await withUser(deps.db, req.userId, (tx) => tx.query('UPDATE app_user SET totp_secret_enc = $1, totp_recovery = $2 WHERE id = app_current_user()',
      [deps.keys.crypto.seal('app_user', 'totp', req.userId, secret), JSON.stringify(codes.map((c) => sha(c).toString('hex')))]));
    return { ok: true };
  });
  app.post('/auth/totp/disable', { preHandler: requireAuth }, async (req) => {
    const b = z.object({ code: z.string().min(6).max(20) }).parse(req.body);
    await withUser(deps.db, req.userId, async (tx) => {
      if (!(await verifyTotpForUser(tx, deps, b.code))) throw new HttpProblem(422, 'totp_invalid', 'That code didn’t match');
      await tx.query('UPDATE app_user SET totp_secret_enc = NULL, totp_recovery = NULL WHERE id = app_current_user()');
    });
    return { ok: true };
  });

  // Passphrase reset — server-side only (06 §5.2, §5.5). Refused unless the request comes
  // from loopback / the Docker network and did not pass through Caddy; Caddy also refuses the path.
  app.post('/auth/reset-passphrase', async (req) => {
    if (!isInternalRequest(req.ip, req.headers, deps.env.INTERNAL_NETWORK_CIDRS)) throw new HttpProblem(404, 'not_found', 'Not found');
    const userId = await anonymous(deps.db, async (tx) => (await tx.query<{ id: string }>('SELECT id FROM auth_single_user()')).rows[0]?.id);
    if (!userId) throw new HttpProblem(409, 'not_set_up', 'Not set up yet');
    return { token: await createResetToken(deps, userId), expires_in: 900 };
  });
  app.post('/auth/reset-passphrase/:token', strict, async (req) => {
    const b = z.object({ passphrase: z.string().min(12).max(256) }).parse(req.body);
    await consumeResetToken(deps, (req.params as { token: string }).token, b.passphrase);
    return { ok: true };
  });
}
