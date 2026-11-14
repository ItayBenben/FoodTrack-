/**
 * The 90-day synthetic fixture (07 M1): realistic logging with a KNOWN injected
 * dairy → loose-stool effect at 6–24 h lag. Deterministic (seeded RNG) so tests can
 * assert the engine recovers it. Used for the rest of the project.
 */
import { addDays, localDay, uuidv7, zonedTimeToUtc, type ObservationInput } from '@foodtrack/shared';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface FoodRef { id: string; name: string; he: string; grams: number; qty: number; unit: string }
export interface FixtureOptions {
  days?: number; seed?: number; endDay?: string; timezone?: string;
  dairyPrevalence?: number; baselineLoose?: number; dairyLoose?: number; effect?: boolean;
}
export interface FixtureTruth { dairyDays: string[]; looseAfterDairy: number; looseOtherwise: number }

const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
function normal(r: () => number, mu: number, sd: number) { const u = r() || 1e-9; const v = r(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function generateFixture(foods: Map<string, FoodRef>, opts: FixtureOptions = {}): { observations: ObservationInput[]; truth: FixtureTruth } {
  const r = rng(opts.seed ?? 42);
  const days = opts.days ?? 90;
  const tz = opts.timezone ?? 'Asia/Jerusalem';
  const end = opts.endDay ?? addDays(localDay(new Date(), { timezone: tz, dayRollover: '04:00' }), -1);
  const pDairy = opts.dairyPrevalence ?? 0.4;
  const pLooseBase = opts.baselineLoose ?? 0.12;
  const pLooseDairy = opts.effect === false ? pLooseBase : (opts.dairyLoose ?? 0.5);
  const F = (n: string) => { const f = foods.get(n); if (!f) throw new Error(`fixture needs food '${n}'`); return f; };
  const out: ObservationInput[] = [];
  const truth: FixtureTruth = { dairyDays: [], looseAfterDairy: 0, looseOtherwise: 0 };
  const dairyMealTimes: number[] = [];

  const at = (day: string, hhmm: string, jitterMin = 0) => {
    const base = zonedTimeToUtc(day, hhmm, tz).getTime();
    return new Date(base + Math.round(normal(r, 0, jitterMin)) * 60_000);
  };
  const meal = (day: string, slot: string, time: Date, names: string[]) => {
    const items = names.map((n, i) => { const f = F(n); return { raw_text: f.he, food_id: f.id, quantity: f.qty, unit: f.unit, grams_est: f.grams, confidence: 0.92, resolved_by: 'library' as const, portion_precision: 'estimated' as const, position: i }; });
    out.push({ client_id: `fx-${uuidv7()}`, tracker_key: 'meal', occurred_at: time.toISOString(), time_source: 'user_set', source: 'manual',
      values: { slot, description: names.map((n) => F(n).he).join(', ') }, meal_items: items });
  };

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(end, -i);
    const dairy = r() < pDairy;
    if (dairy) truth.dairyDays.push(day);
    // breakfast
    const bt = at(day, '08:00', 35);
    const bfDairy = dairy && r() < 0.8;
    meal(day, 'breakfast', bt, bfDairy ? pick(r, [['Coffee with milk', 'White bread'], ['Yogurt', 'Granola'], ['Coffee with milk', 'Egg', 'Israeli salad'], ['White cheese', 'Whole wheat bread', 'Coffee with milk']])
      : pick(r, [['Coffee', 'White bread', 'Avocado'], ['Coffee', 'Egg', 'Israeli salad'], ['Oats', 'Banana', 'Tea'], ['Coffee', 'Shakshuka', 'Pita bread']]));
    if (bfDairy) dairyMealTimes.push(bt.getTime());
    // lunch
    const lt = at(day, '13:15', 40);
    const lDairy = dairy && !bfDairy;
    meal(day, 'lunch', lt, lDairy ? pick(r, [['Pizza', 'Cola'], ['Feta cheese', 'Pasta', 'Israeli salad'], ['Iced coffee', 'Sabich']])
      : pick(r, [['Pita bread', 'Hummus', 'Israeli salad'], ['Chicken breast', 'White rice', 'Israeli salad'], ['Schnitzel', 'Potato'], ['Falafel', 'Pita bread', 'Tahini'], ['Shawarma', 'Laffa']]));
    if (lDairy) dairyMealTimes.push(lt.getTime());
    // dinner (logged 85% of days)
    if (r() < 0.85) meal(day, 'dinner', at(day, '19:40', 45), pick(r, [['Chicken soup', 'White bread'], ['White fish', 'White rice', 'Broccoli'], ['Lentils', 'White rice'], ['Beef', 'Sweet potato', 'Israeli salad'], ['Egg', 'Whole wheat bread', 'Cucumber', 'Tomato']]));
    if (r() < 0.35) meal(day, 'snack', at(day, '16:30', 60), [pick(r, ['Apple', 'Bamba', 'Almonds', 'Dark chocolate', 'Rice cakes', 'Dates'])]);
  }

  // Outcomes are placed after all meals so the lag relation is exact: a stool is "after dairy"
  // when some dairy meal happened 6–24 h before it.
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(end, -i);
    const nStool = r() < 0.75 ? 1 : 2;
    const times = ['07:40', '15:30'].slice(0, nStool).map((t) => at(day, t, 50));
    for (const t of times) {
      if (t.getTime() > Date.now()) continue;
      const lagged = dairyMealTimes.some((m) => { const h = (t.getTime() - m) / 3600_000; return h >= 6 && h < 24; });
      const loose = r() < (lagged ? pLooseDairy : pLooseBase);
      if (loose) { if (lagged) truth.looseAfterDairy++; else truth.looseOtherwise++; }
      const bristol = loose ? (r() < 0.6 ? 6 : 7) : (r() < 0.06 ? 2 : pick(r, [3, 4, 4, 4, 5]));
      out.push({ client_id: `fx-${uuidv7()}`, tracker_key: 'stool', occurred_at: t.toISOString(), time_source: 'user_set', source: 'manual',
        values: { bristol, urgency: loose ? Math.round(clamp(normal(r, 3, 0.8), 0, 4)) : Math.round(clamp(normal(r, 1, 0.7), 0, 4)) } });
      if (loose && r() < 0.7) {
        out.push({ client_id: `fx-${uuidv7()}`, tracker_key: 'symptom', occurred_at: new Date(t.getTime() + 20 * 60_000).toISOString(), time_source: 'user_set', source: 'manual',
          values: { kind: 'bloating', severity: Math.round(clamp(normal(r, 6, 1.5), 1, 9)) } });
      }
    }
    if (r() < 0.9) {
      const sleep = Math.round(clamp(normal(r, 7, 1), 3.5, 10) * 2) / 2;
      out.push({ client_id: `fx-${uuidv7()}`, tracker_key: 'checkin', occurred_at: at(day, '22:10', 30).toISOString(), time_source: 'user_set', source: 'manual',
        values: { energy: Math.round(clamp(normal(r, 3.4, 0.9), 1, 5)), mood: Math.round(clamp(normal(r, 3.5, 0.8), 1, 5)), stress: Math.round(clamp(normal(r, 2.6, 1), 1, 5)), sleep_hours: sleep, all_clear: r() < 0.5 } });
    }
    if (i % 7 === 3) out.push({ client_id: `fx-${uuidv7()}`, tracker_key: 'weight', occurred_at: at(day, '07:15', 10).toISOString(), time_source: 'user_set', source: 'manual', values: { kg: Math.round(normal(r, 78.4, 0.4) * 10) / 10, context: 'morning_fasted' } });
    if (r() < 0.06) out.push({ client_id: `fx-${uuidv7()}`, tracker_key: 'medication', occurred_at: at(day, '12:00', 120).toISOString(), time_source: 'user_set', source: 'manual', values: { name: 'Ibuprofen', class: 'nsaid', dose: '400 mg' } });
    if (r() < 0.25) out.push({ client_id: `fx-${uuidv7()}`, tracker_key: 'exercise', occurred_at: at(day, '18:00', 40).toISOString(), time_source: 'user_set', source: 'manual', values: { kind: pick(r, ['walk', 'run', 'strength']), minutes: Math.round(clamp(normal(r, 45, 20), 10, 120)) } });
  }
  return { observations: out.filter((o) => Date.parse(o.occurred_at) <= Date.now()), truth };
}
