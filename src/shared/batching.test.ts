import { describe, expect, it } from 'vitest';
import { encodedLength, makeBatches, MAX_BATCH_ITEMS, MAX_ENCODED_LENGTH } from './batching';

describe('makeBatches', () => {
  it('returns no batches for no texts', () => {
    expect(makeBatches([])).toEqual([]);
  });

  it('respects the 40-item limit', () => {
    const texts = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const batches = makeBatches(texts);
    expect(batches.map((b) => b.texts.length)).toEqual([40, 40, 20]);
    batches.forEach((b) => expect(b.texts.length).toBeLessThanOrEqual(MAX_BATCH_ITEMS));
  });

  it('respects the 4000 encoded-char limit', () => {
    // Turkish/special chars inflate the encoded length.
    const texts = Array.from({ length: 39 }, (_, i) => `ğüşıöç ${i} `.repeat(10));
    const batches = makeBatches(texts);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(encodedLength(b.texts)).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);
  });

  it('keeps order and covers every index exactly once', () => {
    const texts = Array.from({ length: 123 }, (_, i) => 'x'.repeat((i * 37) % 300));
    const batches = makeBatches(texts);
    const all = batches.flatMap((b) => b.indices);
    expect(all).toEqual(texts.map((_, i) => i));
    batches.forEach((b) => b.indices.forEach((idx, j) => expect(b.texts[j]).toBe(texts[idx])));
  });

  it('never splits a single text, even if it alone exceeds the limit', () => {
    const huge = 'a'.repeat(5000);
    const batches = makeBatches(['short', huge, 'tail']);
    expect(batches.map((b) => b.texts)).toEqual([['short'], [huge], ['tail']]);
  });

  it('packs up to exactly the limit', () => {
    // two texts of 1998 + "%0A" (3) = 3999 → fit; adding one more char text does not
    const a = 'a'.repeat(1998);
    const batches = makeBatches([a, a, 'b'], 4000);
    expect(batches.map((b) => b.texts.length)).toEqual([2, 1]);
  });
});
