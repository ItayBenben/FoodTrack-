import { describe, expect, it } from 'vitest';
import { admit, fitWithin } from './photos';

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
