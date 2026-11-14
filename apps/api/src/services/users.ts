import type { Tx } from '../db/pool.js';

export interface UserSettings {
  id: string; email: string | null; display_name: string | null; locale: string; timezone: string;
  day_rollover: string; units: Record<string, string>; theme: string; quiet_from: string; quiet_to: string;
  reminders_paused_until: string | null; idle_lock_minutes: number; onboarded_at: string | null;
  disclaimer_accepted_at: string | null; totp_enabled: boolean; created_at: string;
}

export async function getUser(tx: Tx): Promise<UserSettings> {
  const { rows } = await tx.query<UserSettings>(
    `SELECT id, email, display_name, locale, timezone, day_rollover::text AS day_rollover, units, theme,
            quiet_from::text AS quiet_from, quiet_to::text AS quiet_to, reminders_paused_until, idle_lock_minutes,
            onboarded_at, disclaimer_accepted_at, totp_secret_enc IS NOT NULL AS totp_enabled, created_at
     FROM app_user WHERE id = app_current_user()`);
  if (!rows[0]) throw new Error('no current user (app.user_id not set?)');
  return rows[0];
}
