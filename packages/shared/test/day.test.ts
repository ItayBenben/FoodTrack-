import { describe, expect, it } from 'vitest';
import { addDays, localDay, zonedTimeToUtc } from '../src/day';
import { containsForbiddenKey, lintCopy, numeralsNotInInput } from '../src/index';

const IL = { timezone: 'Asia/Jerusalem', dayRollover: '04:00' };
describe('day boundary (D10)', () => {
  it('01:00 belongs to yesterday', () => expect(localDay('2026-08-21T01:00:00+03:00', IL)).toBe('2026-08-20'));
  it('04:00 is the new day', () => expect(localDay('2026-08-21T04:00:00+03:00', IL)).toBe('2026-08-21'));
  it('03:59:59 is still yesterday', () => expect(localDay('2026-08-21T03:59:59+03:00', IL)).toBe('2026-08-20'));
  it('uses the user timezone, not the offset in the string', () => {
    expect(localDay('2026-08-21T01:30:00Z', IL)).toBe('2026-08-21');
    expect(localDay('2026-08-20T23:30:00Z', IL)).toBe('2026-08-20');
  });
  it('handles a custom rollover', () => expect(localDay('2026-08-21T05:30:00+03:00', { ...IL, dayRollover: '06:00' })).toBe('2026-08-20'));
  it('handles DST transitions (Israel, last Friday before 2 April)', () => {
    expect(localDay('2026-03-27T04:30:00+03:00', IL)).toBe('2026-03-27'); expect(localDay('2026-03-27T03:30:00+03:00', IL)).toBe('2026-03-26');
    expect(localDay('2026-10-25T01:30:00+02:00', IL)).toBe('2026-10-24');
  });
  it('month and year edges', () => { expect(addDays('2026-01-01', -1)).toBe('2025-12-31'); expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); });
  it('zonedTimeToUtc inverts the wall clock', () => expect(zonedTimeToUtc('2026-08-21', '13:05', 'Asia/Jerusalem').toISOString()).toBe('2026-08-21T10:05:00.000Z'));
  it('rejects garbage', () => expect(() => localDay('not a date', IL)).toThrow());
});

describe('copy rules', () => {
  it('flags causal and diagnostic language in both locales', () => {
    expect(lintCopy('Dairy causes your bloating').map((v) => v.code)).toContain('causal');
    expect(lintCopy('חלב גורם לנפיחות').map((v) => v.code)).toContain('causal_he');
    expect(lintCopy('You have IBS').map((v) => v.code)).toContain('diagnostic');
    expect(lintCopy('On days with dairy, loose stool happened more often.')).toEqual([]);
  });
  it('finds numerals the narrative invented', () => {
    expect(numeralsNotInInput('41 days, 44% vs 19%', { n: 41, a: 0.44, b: 0.19 })).toEqual([]);
    expect(numeralsNotInInput('about 60% of the time', { a: 0.44 })).toEqual(['60']);
  });
  it('detects forbidden sync keys at any depth', () => {
    expect(containsForbiddenKey({ a: [{ b: { allocation_key: 'x' } }] })).toBe('allocation_key');
    expect(containsForbiddenKey({ a: 1 })).toBeNull();
  });
});
