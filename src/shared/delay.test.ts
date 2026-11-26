import { describe, expect, it } from 'vitest';
import { clampDelay, cueTime, formatDelay } from './delay';

describe('delay helpers', () => {
  it('clamps, rounds and normalizes -0', () => {
    expect(clampDelay(0.1 + 0.2)).toBe(0.3);
    expect(clampDelay(25)).toBe(10);
    expect(clampDelay(-25)).toBe(-10);
    expect(clampDelay(Number.NaN)).toBe(0);
    expect(Object.is(clampDelay(-0.01), 0)).toBe(true);
  });

  it('shifts the lookup time: positive delay shows subtitles later', () => {
    expect(cueTime(10, 2)).toBe(8);
    expect(cueTime(10, -1.5)).toBe(11.5);
  });

  it('formats for the popup', () => {
    expect(formatDelay(0)).toBe('0 s');
    expect(formatDelay(1.5)).toBe('+1.5 s');
    expect(formatDelay(-0.5, 'sn')).toBe('−0.5 sn');
    expect(formatDelay(2)).toBe('+2 s');
  });
});

describe('SET_DELAY message', () => {
  it('is accepted only with a finite numeric delay', async () => {
    const { isRuntimeMessage } = await import('./types');
    expect(isRuntimeMessage({ type: 'SET_DELAY', delay: 1.5 })).toBe(true);
    expect(isRuntimeMessage({ type: 'SET_DELAY', delay: '1' })).toBe(false);
    expect(isRuntimeMessage({ type: 'SET_DELAY', delay: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isRuntimeMessage({ type: 'SET_DELAY' })).toBe(false);
  });
});
