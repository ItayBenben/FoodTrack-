import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withUser } from '../db/pool.js';
import { getUser } from '../services/users.js';
import { HttpProblem } from '../lib/problem.js';

const Time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

export async function meRoutes(app: FastifyInstance) {
  const { deps } = app;
  app.get('/me/settings', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const user = await getUser(tx);
    const { rows } = await tx.query<{ birth_year: number | null; sex_at_birth: string | null; height_cm: number | null; goals: string[] | null; conditions_note: Buffer | null }>(
      'SELECT birth_year, sex_at_birth, height_cm, goals, conditions_note FROM user_profile');
    const p = rows[0];
    return { ...user, llm: deps.llm.describe(), profile: p ? { ...p, conditions_note: deps.keys.crypto.open('user_profile', 'conditions_note', req.userId, p.conditions_note) } : null };
  }));
  app.put('/me/settings', async (req) => {
    const b = z.object({
      display_name: z.string().max(80).nullable().optional(), locale: z.enum(['he-IL', 'en-US']).optional(), timezone: z.string().max(64).optional(),
      day_rollover: Time.optional(), units: z.record(z.string(), z.string()).optional(), theme: z.enum(['system', 'light', 'dark']).optional(),
      idle_lock_minutes: z.number().int().min(0).max(1440).optional(), disclaimer_accepted: z.boolean().optional(),
      profile: z.object({ birth_year: z.number().int().min(1900).max(2100).nullable().optional(), sex_at_birth: z.string().max(20).nullable().optional(),
        height_cm: z.number().min(50).max(260).nullable().optional(), goals: z.array(z.string()).optional(), conditions_note: z.string().max(2000).nullable().optional() }).optional(),
    }).parse(req.body);
    if (b.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: b.timezone }); } catch { throw new HttpProblem(422, 'validation', 'Unknown timezone', `'${b.timezone}' is not an IANA timezone.`); } }
    return withUser(deps.db, req.userId, async (tx) => {
      const sets: string[] = []; const p: unknown[] = [];
      const set = (col: string, v: unknown) => { p.push(v); sets.push(`${col} = $${p.length}`); };
      if (b.display_name !== undefined) set('display_name', b.display_name);
      if (b.locale) set('locale', b.locale);
      if (b.timezone) set('timezone', b.timezone);
      if (b.day_rollover) set('day_rollover', b.day_rollover);
      if (b.units) set('units', b.units);
      if (b.theme) set('theme', b.theme);
      if (b.idle_lock_minutes !== undefined) set('idle_lock_minutes', b.idle_lock_minutes);
      if (b.disclaimer_accepted) sets.push('disclaimer_accepted_at = coalesce(disclaimer_accepted_at, now())');
      if (sets.length) await tx.query(`UPDATE app_user SET ${sets.join(', ')} WHERE id = app_current_user()`, p);
      if (b.timezone || b.day_rollover) {
        // local_day depends on both: recompute every observation's day (02 §7 rule 2).
        await tx.query(`UPDATE observation o SET local_day = ((o.occurred_at AT TIME ZONE u.timezone) - u.day_rollover::interval)::date
                        FROM app_user u WHERE u.id = o.user_id`);
      }
      if (b.profile) {
        const pr = b.profile;
        await tx.query(`INSERT INTO user_profile (user_id) VALUES (app_current_user()) ON CONFLICT DO NOTHING`);
        await tx.query(`UPDATE user_profile SET birth_year = CASE WHEN $1 THEN $2 ELSE birth_year END, sex_at_birth = CASE WHEN $3 THEN $4 ELSE sex_at_birth END,
          height_cm = CASE WHEN $5 THEN $6 ELSE height_cm END, goals = coalesce($7, goals),
          conditions_note = CASE WHEN $8 THEN $9 ELSE conditions_note END, updated_at = now()`,
          [pr.birth_year !== undefined, pr.birth_year ?? null, pr.sex_at_birth !== undefined, pr.sex_at_birth ?? null, pr.height_cm !== undefined, pr.height_cm ?? null,
            pr.goals ?? null, pr.conditions_note !== undefined, deps.keys.crypto.sealOpt('user_profile', 'conditions_note', req.userId, pr.conditions_note ?? null)]);
      }
      return getUser(tx);
    });
  });

  app.get('/me/reminders', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT kind, enabled, at_time::text AS at_time, days_of_week FROM reminder_pref ORDER BY kind`);
    const u = await getUser(tx);
    return { data: rows, quiet_from: u.quiet_from, quiet_to: u.quiet_to, paused_until: u.reminders_paused_until };
  }));
  app.put('/me/reminders', async (req) => {
    const b = z.object({
      reminders: z.array(z.object({ kind: z.enum(['checkin', 'meal_nudge', 'trial_daily', 'weekly_insight']), enabled: z.boolean(), at_time: Time.nullable().optional(), days_of_week: z.array(z.number().int().min(0).max(6)).optional() })).optional(),
      quiet_from: Time.optional(), quiet_to: Time.optional(), paused_until: z.string().datetime({ offset: true }).nullable().optional(),
    }).parse(req.body);
    return withUser(deps.db, req.userId, async (tx) => {
      for (const r of b.reminders ?? []) {
        await tx.query(`INSERT INTO reminder_pref (user_id, kind, enabled, at_time, days_of_week) VALUES (app_current_user(), $1, $2, $3, coalesce($4, '{0,1,2,3,4,5,6}'))
          ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled, at_time = coalesce(EXCLUDED.at_time, reminder_pref.at_time), days_of_week = coalesce($4, reminder_pref.days_of_week)`,
          [r.kind, r.enabled, r.at_time ?? null, r.days_of_week ?? null]);
      }
      if (b.quiet_from) await tx.query('UPDATE app_user SET quiet_from = $1 WHERE id = app_current_user()', [b.quiet_from]);
      if (b.quiet_to) await tx.query('UPDATE app_user SET quiet_to = $1 WHERE id = app_current_user()', [b.quiet_to]);
      if (b.paused_until !== undefined) await tx.query('UPDATE app_user SET reminders_paused_until = $1 WHERE id = app_current_user()', [b.paused_until]);
      return { ok: true };
    });
  });

  app.get('/safety-flags', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT id, rule_key, observation_id, raised_at, acknowledged_at, detail FROM safety_flag ORDER BY raised_at DESC LIMIT 200`);
    const active = rows.filter((r: { acknowledged_at: Date | null }) => !r.acknowledged_at);
    return { data: rows, active, total: rows.length };
  }));
  app.post('/safety-flags/:id/acknowledge', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`UPDATE safety_flag SET acknowledged_at = coalesce(acknowledged_at, now()) WHERE id = $1 RETURNING id, acknowledged_at`, [(req.params as { id: string }).id]);
    if (!rows[0]) throw new HttpProblem(404, 'not_found', 'Flag not found');
    return { ...rows[0], suppressed_until: new Date(Date.now() + 7 * 86400_000).toISOString() };
  }));
  app.get('/inbox', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT id, kind, ref_id, payload, created_at, read_at FROM inbox_item ORDER BY created_at DESC LIMIT 100`);
    return { data: rows, unread: rows.filter((r: { read_at: Date | null }) => !r.read_at).length, total: rows.length };
  }));
  app.post('/inbox/:id/read', async (req) => withUser(deps.db, req.userId, async (tx) => {
    await tx.query('UPDATE inbox_item SET read_at = coalesce(read_at, now()) WHERE id = $1', [(req.params as { id: string }).id]);
    return { ok: true };
  }));

  app.get('/security/status', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT action, at FROM security_audit WHERE action IN ('recovery_card_shown','recovery_card_verified') ORDER BY at DESC LIMIT 1`);
    return { encryption: 'on', alg: deps.keys.alg, created_at: deps.keys.createdAt, rotated_at: deps.keys.rotatedAt, checksum: deps.keys.checksum,
      fields_encrypted: ['observation.note', 'observation_value (sensitive text fields)', 'meal_item.raw_text', 'user_food.alias', 'user_profile.conditions_note',
        'trial.abandon_reason', 'trial_day.note', 'association.narrative', 'event_marker.label', 'media objects'],
      last_card_event: rows[0] ?? null };
  }));
  app.get('/security/audit', async (req) => withUser(deps.db, req.userId, async (tx) => {
    const { rows } = await tx.query(`SELECT action, detail, ip, at FROM security_audit ORDER BY at DESC LIMIT 100`);
    return { data: rows, total: rows.length };
  }));

  // DELETE /me — hard delete; requires the passphrase again and a typed confirmation.
  app.delete('/me', async (req) => {
    const b = z.object({ passphrase: z.string().min(1), confirm: z.literal('DELETE') }).parse(req.body);
    const { verify } = await import('@node-rs/argon2');
    await withUser(deps.db, req.userId, async (tx) => {
      const { rows } = await tx.query<{ password_hash: string }>('SELECT password_hash FROM app_user WHERE id = app_current_user()');
      if (!rows[0] || !(await verify(rows[0].password_hash, b.passphrase).catch(() => false))) throw new HttpProblem(401, 'bad_credentials', 'That passphrase didn’t work', 'Nothing was deleted.');
      const { rows: media } = await tx.query<{ storage_key: string }>('SELECT storage_key FROM media');
      for (const m of media) await deps.media.delete(m.storage_key);
      await tx.query('DELETE FROM app_user WHERE id = app_current_user()');
    });
    return { deleted: true };
  });
}
