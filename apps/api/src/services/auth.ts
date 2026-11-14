/**
 * Authentication (03 §2, 06 §5). Argon2id; short-lived JWT access tokens; rotating
 * refresh tokens in an HttpOnly cookie with reuse detection (a replayed refresh token
 * revokes its whole family). Single-user mode issues real tokens — no bypass path.
 * The passphrase is an auth credential, never an encryption key (D27).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { Deps } from '../app.js';
import { anonymous, withUser, type Tx } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';

export const ARGON2 = { memoryCost: 65536, timeCost: 3, parallelism: 4, algorithm: 2 as const };
export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_DAYS = 30;
export const REFRESH_COOKIE = 'ft_refresh';
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$0f5Ow3dF6sxaxJGFhW7PuZ3w2nX0sJk3m3ycmw2m8xI';

export const sha = (s: string) => createHash('sha256').update(s).digest();
const secretKey = (deps: Deps) => new TextEncoder().encode(deps.env.SESSION_SECRET);

export async function hashPassphrase(p: string) { return hash(p, ARGON2); }

export async function issueAccess(deps: Deps, userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`).setAudience('foodtrack').sign(secretKey(deps));
}

export async function verifyAccess(deps: Deps, token: string): Promise<{ userId: string; sessionId: string }> {
  try {
    const { payload } = await jwtVerify(token, secretKey(deps), { audience: 'foodtrack', algorithms: ['HS256'] });
    return { userId: String(payload.sub), sessionId: String(payload.sid) };
  } catch {
    throw new HttpProblem(401, 'unauthenticated', 'Session expired', 'Unlock again to continue. Anything you logged is still saved on this device.');
  }
}

export interface Tokens { access_token: string; expires_in: number; refresh_token: string; session_id: string }

async function newSession(tx: Tx, deps: Deps, userId: string, familyId: string | null, label: string | null): Promise<Tokens> {
  const refresh = randomBytes(32).toString('base64url');
  const { rows } = await tx.query<{ id: string; family_id: string }>(
    `INSERT INTO auth_session (user_id, family_id, token_hash, device_label, expires_at)
     VALUES ($1, coalesce($2::uuid, uuidv7()), $3, $4, now() + make_interval(days => $5)) RETURNING id, family_id`,
    [userId, familyId, sha(refresh), label, REFRESH_TTL_DAYS]);
  if (!familyId) await tx.query('UPDATE auth_session SET family_id = id WHERE id = $1', [rows[0]!.id]);
  return { access_token: await issueAccess(deps, userId, rows[0]!.id), expires_in: ACCESS_TTL_S, refresh_token: refresh, session_id: rows[0]!.id };
}

async function audit(tx: Tx, action: string, detail: Record<string, unknown>, ip: string | null) {
  await tx.query('INSERT INTO security_audit (user_id, action, detail, ip) VALUES (app_current_user(), $1, $2, $3)', [action, detail, ip]);
}

interface AuthRow { id: string; password_hash: string | null; failed_attempts: number; locked_until: Date | null; totp_enabled: boolean }

async function checkCredential(deps: Deps, row: AuthRow | undefined, secret: string, ip: string, totp?: string): Promise<string> {
  if (!row) { await verify(DUMMY_HASH, secret).catch(() => false); throw badCredentials(null); }
  if (row.locked_until && row.locked_until.getTime() > Date.now()) {
    const s = Math.ceil((row.locked_until.getTime() - Date.now()) / 1000);
    throw new HttpProblem(429, 'locked', 'Too many attempts', `Try again in ${s} s.`, undefined, { retry_after_s: s, locked_until: row.locked_until.toISOString() });
  }
  const ok = row.password_hash ? await verify(row.password_hash, secret).catch(() => false) : false;
  await anonymous(deps.db, (tx) => tx.query('SELECT auth_record_attempt($1, $2)', [row.id, ok]));
  if (!ok) {
    const remaining = Math.max(0, 5 - (row.failed_attempts + 1));
    throw badCredentials(row.failed_attempts + 1 >= 3 ? remaining : null);
  }
  if (row.totp_enabled) {
    const okTotp = totp ? await withUser(deps.db, row.id, (tx) => verifyTotpForUser(tx, deps, totp)) : false;
    if (!okTotp) throw new HttpProblem(401, 'totp_required', totp ? 'Code not accepted' : 'Two-factor code needed', 'Enter the 6-digit code from your authenticator app, or a recovery code.', undefined, { totp_required: true });
  }
  void ip;
  return row.id;
}

function badCredentials(remaining: number | null) {
  return new HttpProblem(401, 'bad_credentials', 'That passphrase didn’t work', remaining === null ? 'Check it and try again.' : `${remaining} attempts left before a short lockout.`,
    undefined, remaining === null ? {} : { attempts_remaining: remaining });
}

export async function unlock(deps: Deps, passphrase: string, ip: string, label: string | null, totp?: string): Promise<Tokens> {
  if (deps.env.AUTH_MODE !== 'single') throw new HttpProblem(404, 'not_found', 'Not available', 'This instance uses email login.');
  const row = await anonymous(deps.db, async (tx) => (await tx.query<AuthRow>('SELECT id, password_hash, failed_attempts, locked_until, totp_enabled FROM auth_single_user()')).rows[0]);
  if (!row) throw new HttpProblem(409, 'not_set_up', 'Not set up yet', 'Run first-time setup to choose a passphrase.');
  const uid = await checkCredential(deps, row, passphrase, ip, totp);
  return withUser(deps.db, uid, async (tx) => { const t = await newSession(tx, deps, uid, null, label); await audit(tx, 'unlock', {}, ip); return t; });
}

export async function login(deps: Deps, email: string, password: string, ip: string, label: string | null, totp?: string): Promise<Tokens> {
  const row = await anonymous(deps.db, async (tx) => (await tx.query<AuthRow>('SELECT id, password_hash, failed_attempts, locked_until, totp_enabled FROM auth_find_user_by_email($1)', [email])).rows[0]);
  const uid = await checkCredential(deps, row, password, ip, totp);
  return withUser(deps.db, uid, async (tx) => { const t = await newSession(tx, deps, uid, null, label); await audit(tx, 'login', {}, ip); return t; });
}

export async function createAccount(deps: Deps, input: { email: string | null; secret: string; display_name?: string; locale: string; timezone: string }, ip: string, label: string | null): Promise<{ userId: string; tokens: Tokens }> {
  const n = await anonymous(deps.db, async (tx) => Number((await tx.query<{ n: string }>('SELECT auth_count_users() AS n')).rows[0]!.n));
  if (deps.env.AUTH_MODE === 'single' && n > 0) throw new HttpProblem(409, 'already_set_up', 'Already set up', 'This instance already has a passphrase. Unlock instead, or reset it from the server.');
  if (deps.env.AUTH_MODE === 'multi' && !input.email) throw new HttpProblem(422, 'validation', 'Email required');
  const h = await hashPassphrase(input.secret);
  let userId: string;
  try {
    userId = await anonymous(deps.db, async (tx) => (await tx.query<{ id: string }>('SELECT auth_create_user($1,$2,$3,$4,$5) AS id',
      [input.email, h, input.display_name ?? null, input.locale, input.timezone])).rows[0]!.id);
  } catch (e) {
    if (String((e as Error).message).includes('unique')) throw new HttpProblem(409, 'email_taken', 'That email is already registered', 'Log in instead.');
    throw e;
  }
  const tokens = await withUser(deps.db, userId, async (tx) => {
    await tx.query('INSERT INTO user_profile (user_id) VALUES (app_current_user()) ON CONFLICT DO NOTHING');
    for (const kind of ['checkin', 'meal_nudge', 'trial_daily', 'weekly_insight']) {
      await tx.query(`INSERT INTO reminder_pref (user_id, kind, enabled, at_time) VALUES (app_current_user(), $1, $2, $3) ON CONFLICT DO NOTHING`,
        [kind, kind === 'checkin' || kind === 'trial_daily', kind === 'checkin' ? '21:30' : kind === 'trial_daily' ? '20:00' : kind === 'weekly_insight' ? '10:00' : null]);
    }
    await audit(tx, 'account_created', { mode: deps.env.AUTH_MODE }, ip);
    return newSession(tx, deps, userId, null, label);
  });
  return { userId, tokens };
}

export async function refresh(deps: Deps, token: string | undefined): Promise<Tokens> {
  const expired = new HttpProblem(401, 'unauthenticated', 'Session expired', 'Unlock again to continue. Anything you logged is still saved on this device.');
  if (!token) throw expired;
  const row = await anonymous(deps.db, async (tx) => (await tx.query<{ id: string; user_id: string; family_id: string; expires_at: Date; rotated_at: Date | null; revoked_at: Date | null }>(
    'SELECT * FROM auth_find_session($1)', [sha(token)])).rows[0]);
  if (!row || row.revoked_at || row.expires_at.getTime() < Date.now()) throw expired;
  if (row.rotated_at) {
    // Reuse of a rotated token: someone has a copy. Revoke the whole family (03 §2).
    await withUser(deps.db, row.user_id, async (tx) => {
      await tx.query('UPDATE auth_session SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [row.family_id]);
      await audit(tx, 'refresh_reuse_detected', { family_id: row.family_id }, null);
    });
    throw expired;
  }
  return withUser(deps.db, row.user_id, async (tx) => {
    const upd = await tx.query('UPDATE auth_session SET rotated_at = now() WHERE id = $1 AND rotated_at IS NULL', [row.id]);
    if (upd.rowCount !== 1) throw expired;
    return newSession(tx, deps, row.user_id, row.family_id, null);
  });
}

export async function logout(deps: Deps, userId: string, sessionId: string) {
  await withUser(deps.db, userId, async (tx) => {
    const { rows } = await tx.query<{ family_id: string }>('SELECT family_id FROM auth_session WHERE id = $1', [sessionId]);
    if (rows[0]) await tx.query('UPDATE auth_session SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [rows[0].family_id]);
  });
}

export async function assertSessionLive(deps: Deps, userId: string, sessionId: string) {
  const ok = await withUser(deps.db, userId, async (tx) => {
    const { rows } = await tx.query<{ family_id: string }>('SELECT family_id FROM auth_session WHERE id = $1', [sessionId]);
    if (!rows[0]) return false;
    const live = await tx.query('SELECT 1 FROM auth_session WHERE family_id = $1 AND revoked_at IS NULL LIMIT 1', [rows[0].family_id]);
    return live.rows.length > 0;
  });
  if (!ok) throw new HttpProblem(401, 'unauthenticated', 'Signed out', 'This session was signed out. Unlock again to continue.');
}

export async function changePassphrase(deps: Deps, userId: string, sessionId: string, current: string, next: string, ip: string) {
  const row = await withUser(deps.db, userId, async (tx) => (await tx.query<{ password_hash: string }>('SELECT password_hash FROM app_user WHERE id = app_current_user()')).rows[0]);
  if (!row || !(await verify(row.password_hash, current).catch(() => false))) throw badCredentials(null);
  const h = await hashPassphrase(next);
  await withUser(deps.db, userId, async (tx) => {
    const { rows } = await tx.query<{ family_id: string }>('SELECT family_id FROM auth_session WHERE id = $1', [sessionId]);
    await tx.query('UPDATE app_user SET password_hash = $1 WHERE id = app_current_user()', [h]);
    await tx.query('UPDATE auth_session SET revoked_at = now() WHERE revoked_at IS NULL AND family_id <> $1', [rows[0]?.family_id ?? '00000000-0000-0000-0000-000000000000']);
    await audit(tx, 'passphrase_changed', {}, ip);
  });
}

/** Server-side reset (06 §5.2): a single-use 15-minute token. Touches no data. */
export async function createResetToken(deps: Deps, userId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await withUser(deps.db, userId, async (tx) => {
    await tx.query(`INSERT INTO passphrase_reset (token_hash, user_id, expires_at) VALUES ($1, app_current_user(), now() + interval '15 minutes')`, [sha(token)]);
    await audit(tx, 'reset_token_issued', {}, 'local');
  });
  return token;
}

export async function consumeResetToken(deps: Deps, token: string, next: string) {
  const row = await anonymous(deps.db, async (tx) => (await tx.query<{ user_id: string; expires_at: Date; used_at: Date | null }>('SELECT * FROM auth_find_reset($1)', [sha(token)])).rows[0]);
  if (!row || row.used_at || row.expires_at.getTime() < Date.now()) throw new HttpProblem(410, 'reset_expired', 'This reset link has expired', 'Run the reset command on the server again for a new one.');
  const h = await hashPassphrase(next);
  await withUser(deps.db, row.user_id, async (tx) => {
    await tx.query('UPDATE passphrase_reset SET used_at = now() WHERE token_hash = $1', [sha(token)]);
    await tx.query('UPDATE app_user SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = app_current_user()', [h]);
    await tx.query('UPDATE auth_session SET revoked_at = now() WHERE revoked_at IS NULL');
    await audit(tx, 'passphrase_reset', {}, 'local');
  });
}

// ───────────── TOTP (RFC 6238, SHA-1, 30 s, 6 digits) ─────────────
import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/legacy';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf: Uint8Array) { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; }
function unbase32(s: string) { let bits = 0, v = 0; const out: number[] = []; for (const c of s.replace(/=+$/, '').toUpperCase()) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
export function totpAt(secretB32: string, t = Date.now(), step = 0): string {
  const counter = Math.floor(t / 30000) + step;
  const msg = new Uint8Array(8); let c = counter; for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const h = hmac(sha1, unbase32(secretB32), msg); const o = h[19]! & 15;
  const code = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(code % 1_000_000).padStart(6, '0');
}
function safeEq(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }

export async function verifyTotpForUser(tx: Tx, deps: Deps, code: string): Promise<boolean> {
  const { rows } = await tx.query<{ id: string; totp_secret_enc: Buffer | null; totp_recovery: string[] | null }>('SELECT id, totp_secret_enc, totp_recovery FROM app_user WHERE id = app_current_user()');
  const r = rows[0]; if (!r?.totp_secret_enc) return true;
  const secret = deps.keys.crypto.open('app_user', 'totp', r.id, r.totp_secret_enc)!;
  if ([-1, 0, 1].some((s) => safeEq(totpAt(secret, Date.now(), s), code))) return true;
  const codes = r.totp_recovery ?? []; const hc = sha(code.trim()).toString('hex');
  if (codes.includes(hc)) { await tx.query('UPDATE app_user SET totp_recovery = $1 WHERE id = app_current_user()', [JSON.stringify(codes.filter((c) => c !== hc))]); return true; }
  return false;
}
