import { describe, expect, it } from 'vitest';
import {
  cleanCueText,
  decodeEntities,
  findActiveCue,
  findActiveCueIndex,
  normalizeText,
  prioritizeCueIndices,
  sortCues,
  stripTags,
} from './cues';
import type { Cue } from './types';

const cues: Cue[] = [
  { id: 0, start: 1, end: 3, text: 'a' },
  { id: 1, start: 3, end: 5, text: 'b' },
  { id: 2, start: 7, end: 9, text: 'c' },
  { id: 3, start: 10, end: 12, text: 'd' },
];

describe('findActiveCue', () => {
  it('returns undefined before the first cue', () => {
    expect(findActiveCue(cues, 0)).toBeUndefined();
    expect(findActiveCue(cues, 0.999)).toBeUndefined();
  });

  it('returns the cue at exact start boundary (start inclusive, end exclusive)', () => {
    expect(findActiveCue(cues, 1)?.text).toBe('a');
    expect(findActiveCue(cues, 3)?.text).toBe('b');
    expect(findActiveCue(cues, 2.999)?.text).toBe('a');
  });

  it('returns undefined between cues', () => {
    expect(findActiveCue(cues, 5)).toBeUndefined();
    expect(findActiveCue(cues, 6)).toBeUndefined();
    expect(findActiveCue(cues, 9.5)).toBeUndefined();
  });

  it('returns undefined after the last cue', () => {
    expect(findActiveCue(cues, 12)).toBeUndefined();
    expect(findActiveCue(cues, 1000)).toBeUndefined();
  });

  it('handles empty and single lists', () => {
    expect(findActiveCueIndex([], 1)).toBe(-1);
    expect(findActiveCueIndex([cues[0]!], 2)).toBe(0);
  });

  it('handles overlapping cues (latest started, still active)', () => {
    const overlapping: Cue[] = [
      { id: 0, start: 0, end: 10, text: 'long' },
      { id: 1, start: 2, end: 4, text: 'short' },
    ];
    expect(findActiveCue(overlapping, 3)?.text).toBe('short');
    expect(findActiveCue(overlapping, 5)?.text).toBe('long');
  });

  it('works on a large list', () => {
    const many: Cue[] = Array.from({ length: 10000 }, (_, i) => ({ id: i, start: i, end: i + 0.5, text: String(i) }));
    expect(findActiveCue(many, 5000.25)?.text).toBe('5000');
    expect(findActiveCue(many, 5000.75)).toBeUndefined();
  });
});

describe('text cleanup', () => {
  it('normalizes whitespace', () => {
    expect(normalizeText('  hello \n\t world  ')).toBe('hello world');
    expect(normalizeText('a b')).toBe('a b');
  });

  it('strips tags', () => {
    expect(stripTags('<i>hi</i> <b>there</b> <c.yellow>x</c> <v Bob>yo</v>')).toBe('hi there x yo');
    expect(stripTags('a <00:00:01.500>b')).toBe('a b');
  });

  it('decodes entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &#39;s &lt;3 &#x41;')).toBe("Tom & Jerry 's <3 A");
    expect(decodeEntities('&unknown;')).toBe('&unknown;');
  });

  it('cleanCueText combines everything', () => {
    expect(cleanCueText('<i>Hello</i>\n  <b>world</b> &amp; more')).toBe('Hello world & more');
  });
});

describe('sortCues / prioritizeCueIndices', () => {
  it('sorts and re-ids', () => {
    const list: Cue[] = [
      { id: 9, start: 5, end: 6, text: 'b' },
      { id: 8, start: 1, end: 2, text: 'a' },
    ];
    expect(sortCues(list).map((c) => [c.id, c.text])).toEqual([
      [0, 'a'],
      [1, 'b'],
    ]);
  });

  it('puts the current window first, then later cues, then earlier ones', () => {
    const list: Cue[] = Array.from({ length: 20 }, (_, i) => ({ id: i, start: i * 10, end: i * 10 + 5, text: String(i) }));
    const order = prioritizeCueIndices(list, 100, 60);
    // window: end >= 95 && start <= 160 → indices 10..16 (cue 9 ends at 95 → included)
    expect(order.slice(0, 8)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(order.slice(8, 11)).toEqual([17, 18, 19]);
    expect(order.slice(11)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(order).size).toBe(20);
  });
});
