/**
 * Day-boundary maths (D10). A 01:00 snack belongs to yesterday.
 * local_day is ALWAYS computed server-side (02 §7 rule 2); the client uses
 * the same function only to place an optimistic write before the server echoes.
 */
export interface DayConfig { timezone: string; dayRollover: string /* HH:MM[:SS] */ }

function wallClock(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

export function rolloverSeconds(rollover: string): number {
  const [h = '0', m = '0', s = '0'] = rollover.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export function toISODate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toISODate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function localDay(occurredAt: Date | string, cfg: DayConfig): string {
  const at = typeof occurredAt === 'string' ? new Date(occurredAt) : occurredAt;
  if (Number.isNaN(at.getTime())) throw new RangeError('invalid occurred_at');
  const w = wallClock(at, cfg.timezone);
  const secs = w.h * 3600 + w.mi * 60 + w.s;
  const date = toISODate(w.y, w.m, w.d);
  return secs < rolloverSeconds(cfg.dayRollover) ? addDays(date, -1) : date;
}

/** Seconds since local midnight, in the user's timezone. */
export function localSecondsOfDay(at: Date, timezone: string): number {
  const w = wallClock(at, timezone);
  return w.h * 3600 + w.mi * 60 + w.s;
}

/** The UTC instant of a wall-clock time on a local date in a timezone. */
export function zonedTimeToUtc(isoDate: string, hhmm: string, timezone: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const [hh = 0, mm = 0] = hhmm.split(':').map(Number);
  // Start from the naive UTC guess, then correct by the zone offset (twice for DST edges).
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(guess), timezone);
    const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
    guess += Date.UTC(y, m - 1, d, hh, mm) - asUtc;
  }
  return new Date(guess);
}

export function isWeekend(isoDate: string): boolean {
  // Israel: Friday/Saturday. Configurable later; the engine uses weekday as a confounder only.
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 5 || dow === 6;
}
