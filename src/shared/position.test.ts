import { describe, expect, it } from 'vitest';
import { bottomOffsetFromDrag } from './position';

describe('bottomOffsetFromDrag', () => {
  it('converts the box bottom edge into percent from the overlay bottom', () => {
    // overlay 100..500 (height 400); box bottom at 460 → 40px from bottom → 10%
    expect(bottomOffsetFromDrag(100, 400, 460)).toBe(10);
    expect(bottomOffsetFromDrag(0, 400, 200)).toBe(50);
  });

  it('rounds to 0.5% and clamps to the allowed range', () => {
    expect(bottomOffsetFromDrag(0, 1000, 787)).toBe(21.5);
    expect(bottomOffsetFromDrag(0, 400, 600)).toBe(2);
    expect(bottomOffsetFromDrag(0, 400, -50)).toBe(85);
  });

  it('falls back to the minimum for a zero-height overlay', () => {
    expect(bottomOffsetFromDrag(0, 0, 10)).toBe(2);
  });
});
