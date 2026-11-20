import { describe, expect, it } from 'vitest';
import { admit, fitWithin, mergeItems, overallProgress, stageProgress } from './photos';

describe('fitWithin', () => {
  it('shrinks the long edge to the limit and keeps the ratio', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it('never upscales a small picture', () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
  it('handles degenerate sizes', () => expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 }));
});

describe('admit', () => {
  it('takes what fits and reports the rest', () => expect(admit(2, 4, ['a', 'b', 'c'])).toEqual({ take: ['a', 'b'], dropped: 1 }));
  it('takes nothing when full', () => expect(admit(4, 4, ['a'])).toEqual({ take: [], dropped: 1 }));
  it('takes everything when there is room', () => expect(admit(0, 4, ['a', 'b'])).toEqual({ take: ['a', 'b'], dropped: 0 }));
});

describe('mergeItems', () => {
  const it_ = (food_id: string | null, canonical_name: string | null, raw_text: string) => ({ food_id, canonical_name, raw_text });
  it('adds what the photo saw that the text did not mention', () => {
    expect(mergeItems([it_('f1', 'Hummus', 'חומוס')], [it_('f1', 'Hummus', 'hummus'), it_('f2', 'Pita bread', 'פיתה')]).map((x) => x.food_id)).toEqual(['f1', 'f2']);
  });
  it('treats the same name as the same food even without ids', () => {
    expect(mergeItems([it_(null, 'Green salad', 'סלט')], [it_(null, 'green salad', 'salad')])).toHaveLength(1);
  });
});

describe('photo progress (08 §4.4)', () => {
  it('each stage moves the bar forward, and reading never claims to be finished', () => {
    const order = [stageProgress('preparing'), stageProgress('uploading', 0), stageProgress('uploading', 0.5), stageProgress('uploading', 1), stageProgress('reading'), stageProgress('done')];
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!);
    expect(stageProgress('reading')).toBeLessThan(1);
    expect(stageProgress('uploading', 7)).toBe(stageProgress('uploading', 1)); // clamped
  });
  it('the bar shows only while a photo is in flight, and ignores photos already on the meal', () => {
    expect(overallProgress([])).toBeNull();
    expect(overallProgress([{ stage: 'saved' }])).toBeNull();
    expect(overallProgress([{ stage: 'done' }, { stage: 'kept' }])).toBeNull();
    expect(overallProgress([{ stage: 'saved' }, { stage: 'done' }, { stage: 'reading' }])).toBeCloseTo((1 + 0.75) / 2);
  });
});
