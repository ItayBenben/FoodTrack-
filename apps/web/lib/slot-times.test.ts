import { describe, expect, it } from 'vitest';
import { slotClock, slotInstant, type SlotTime } from './slot-times';

const lunch: SlotTime = { slot: 'lunch', median_time: '13:20', n: 5, fallback_time: '13:00' };
const dinner: SlotTime = { slot: 'dinner', median_time: null, n: 0, fallback_time: '19:30' };
const at = (h: number, m = 0, d = 25) => new Date(2026, 10, d, h, m);

describe('slotInstant (quick slot → estimated time, D31)', () => {
  it('uses the median when there is enough history, and marks it slot_median', () => {
    const r = slotInstant(lunch, at(21), at(21), true)!;
    expect(new Date(r.iso).getHours()).toBe(13);
    expect(new Date(r.iso).getMinutes()).toBe(20);
    expect(r.source).toBe('slot_median');
  });
  it('falls back to the config time with no history, marked default (never as a median)', () => {
    const r = slotInstant(dinner, at(22), at(22), true)!;
    expect(new Date(r.iso).getHours()).toBe(19);
    expect(r.source).toBe('default');
    expect(slotClock(dinner)).toBeNull();
  });
  it('keeps "now" when logging within 90 minutes of the slot — that time is exact', () => {
    expect(slotInstant(lunch, at(13, 50), at(13, 50), true)).toBeNull();
  });
  it('a slot still ahead today means the previous day', () => {
    const r = slotInstant(dinner, at(7), at(7), true)!;
    expect(new Date(r.iso).getDate()).toBe(24);
  });
  it('lands on the day the person picked', () => {
    const r = slotInstant(lunch, at(20, 10, 22), at(21), false)!;
    expect(new Date(r.iso).getDate()).toBe(22);
  });
});
