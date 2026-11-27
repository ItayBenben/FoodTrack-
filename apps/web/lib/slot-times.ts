'use client';
/**
 * The user's usual time for each meal slot (03 `/me/slot-times`), cached so a slot can set
 * the time offline. A time taken from here is an estimate and is saved as one (08 §4.15, D31):
 * `slot_median` → `slot_estimate`, a config fallback with no history → `default` → `day_only`.
 */
import { useEffect, useState } from 'react';
import { api, hasToken } from './api';
import { getMeta, setMeta } from './db/local';

export interface SlotTime { slot: string; median_time: string | null; n: number; fallback_time: string }
const KEY = 'slot_times';
const MIN_N = 3; // mirrors slot_median_min_observations; the server re-derives precision anyway

export function useSlotTimes(): SlotTime[] {
  const [slots, setSlots] = useState<SlotTime[]>([]);
  useEffect(() => {
    let live = true;
    void getMeta<SlotTime[]>(KEY, []).then((c) => { if (live && c.length) setSlots(c); });
    if (hasToken()) void api<{ slots: SlotTime[] }>('/me/slot-times').then((r) => { if (!live) return; setSlots(r.slots); void setMeta(KEY, r.slots); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return slots;
}

export type SlotTimeSource = 'slot_median' | 'default';

/**
 * Where a slot puts a meal: its usual time on `day`, or the day before when that is still
 * ahead of now (tapping "Dinner" at 07:00 means last night's). Returns null when logging
 * right now already sits within 90 minutes of the slot — then "now" is the exact time.
 */
export function slotInstant(s: SlotTime, day: Date, now: Date, isNow: boolean): { iso: string; source: SlotTimeSource } | null {
  const useMedian = !!s.median_time && s.n >= MIN_N;
  const [h, m] = (useMedian ? s.median_time! : s.fallback_time).split(':').map(Number);
  const d = new Date(day); d.setHours(h ?? 12, m ?? 0, 0, 0);
  if (isNow && Math.abs(d.getTime() - now.getTime()) <= 90 * 60_000) return null;
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
  return { iso: d.toISOString(), source: useMedian ? 'slot_median' : 'default' };
}

export function slotClock(s: SlotTime): string | null { return s.median_time && s.n >= MIN_N ? s.median_time : null; }
