/**
 * Reminders (D16, 08 §12). Web push with VAPID. Two hard rules: no notification body names a symptom,
 * a food, or a finding; and red flags are NEVER pushed — they wait in the app.
 */
import webpush from 'web-push';
import type { Deps } from '../app.js';
import { anonymous, withUser } from '../db/pool.js';
import { systemHandlers } from '../workers/jobs.js';

const COPY: Record<string, { en: { title: string; body: string }; he: { title: string; body: string } }> = {
  checkin: { en: { title: 'FoodTrack', body: 'A quick check-in for today?' }, he: { title: 'FoodTrack', body: 'צ׳ק-אין קצר להיום?' } },
  meal_nudge: { en: { title: 'FoodTrack', body: 'Anything to log from earlier?' }, he: { title: 'FoodTrack', body: 'משהו לרשום מקודם?' } },
  trial_daily: { en: { title: 'FoodTrack', body: 'Your trial has today’s step ready.' }, he: { title: 'FoodTrack', body: 'הצעד של היום בניסוי מוכן.' } },
  weekly_insight: { en: { title: 'FoodTrack', body: 'Your weekly look is ready.' }, he: { title: 'FoodTrack', body: 'הסיכום השבועי מוכן.' } },
};

function localHM(tz: string, at = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { hm: `${g('hour')}:${g('minute')}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')) };
}
const inQuiet = (hm: string, from: string, to: string) => (from <= to ? hm >= from && hm < to : hm >= from || hm < to);

export async function sendDue(deps: Deps, now = new Date()) {
  if (!deps.env.VAPID_PUBLIC_KEY || !deps.env.VAPID_PRIVATE_KEY) return { sent: 0, reason: 'no_vapid_keys' };
  webpush.setVapidDetails('mailto:foodtrack@localhost', deps.env.VAPID_PUBLIC_KEY, deps.env.VAPID_PRIVATE_KEY);
  const users = await anonymous(deps.db, async (tx) => (await tx.query<{ user_id: string }>(`SELECT user_id FROM job_users_with_activity(interval '1 day')`)).rows);
  let sent = 0;
  for (const u of users) await withUser(deps.db, u.user_id, async (tx) => {
    const { rows: [user] } = await tx.query<{ timezone: string; locale: string; quiet_from: string; quiet_to: string; reminders_paused_until: Date | null }>(`SELECT timezone, locale, quiet_from::text, quiet_to::text, reminders_paused_until FROM app_user WHERE id = app_current_user()`);
    if (!user || (user.reminders_paused_until && user.reminders_paused_until > now)) return;
    const { hm, dow } = localHM(user.timezone, now);
    if (inQuiet(hm, user.quiet_from.slice(0, 5), user.quiet_to.slice(0, 5))) return;
    const { rows: prefs } = await tx.query<{ kind: string; at_time: string | null; days_of_week: number[]; last_sent_at: Date | null }>(`SELECT kind, at_time::text, days_of_week, last_sent_at FROM reminder_pref WHERE enabled AND at_time IS NOT NULL`);
    const { rows: subs } = await tx.query<{ id: string; endpoint: string; p256dh: string; auth: string }>('SELECT id, endpoint, p256dh, auth FROM push_subscription');
    for (const pr of prefs) {
      if (!pr.days_of_week.includes(dow) || hm < pr.at_time!.slice(0, 5)) continue;
      if (pr.last_sent_at && now.getTime() - pr.last_sent_at.getTime() < 20 * 3600_000) continue;
      if (pr.kind === 'checkin') { const done = await tx.query(`SELECT 1 FROM observation o JOIN tracker_definition d ON d.key = o.tracker_key WHERE d.definition->>'counts_as_checkin' = 'true' AND o.local_day = (now() AT TIME ZONE $1)::date AND o.deleted_at IS NULL`, [user.timezone]); if (done.rows[0]) continue; }
      if (pr.kind === 'trial_daily') { const t = await tx.query(`SELECT 1 FROM trial WHERE status = 'active'`); if (!t.rows[0]) continue; }
      const c = COPY[pr.kind]![user.locale.startsWith('he') ? 'he' : 'en'];
      for (const s of subs) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...c, tag: pr.kind, url: '/today' })); sent++; await tx.query('UPDATE push_subscription SET last_ok_at = now() WHERE id = $1', [s.id]); }
        catch (e) { if ([404, 410].includes((e as { statusCode?: number }).statusCode ?? 0)) await tx.query('DELETE FROM push_subscription WHERE id = $1', [s.id]); }
      }
      await tx.query('UPDATE reminder_pref SET last_sent_at = $2 WHERE kind = $1', [pr.kind, now]);
    }
  });
  return { sent };
}
export const PUSH_COPY = COPY;
systemHandlers.set('reminders', (deps) => sendDue(deps));
