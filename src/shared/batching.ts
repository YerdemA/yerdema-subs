// Splits texts into translation batches limited by the encoded `q` length and item count.

export const MAX_ENCODED_LENGTH = 4000;
export const MAX_BATCH_ITEMS = 40;

export interface Batch {
  /** indices into the original `texts` array */
  indices: number[];
  texts: string[];
}

/** Encoded length the batch would have as the `q` query parameter (joined with `\n`). */
export function encodedLength(texts: readonly string[]): number {
  return encodeURIComponent(texts.join('\n')).length;
}

/**
 * Greedy batching in input order. A single text is never split; a text that alone exceeds
 * the length limit becomes its own batch.
 */
export function makeBatches(
  texts: readonly string[],
  maxEncoded = MAX_ENCODED_LENGTH,
  maxItems = MAX_BATCH_ITEMS,
): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = { indices: [], texts: [] };
  let currentLen = 0;
  const sepLen = encodeURIComponent('\n').length;

  texts.forEach((text, index) => {
    const len = encodeURIComponent(text).length;
    const added = current.texts.length === 0 ? len : currentLen + sepLen + len;
    if (current.texts.length > 0 && (added > maxEncoded || current.texts.length >= maxItems)) {
      batches.push(current);
      current = { indices: [], texts: [] };
      currentLen = 0;
    }
    currentLen = current.texts.length === 0 ? len : currentLen + sepLen + len;
    current.indices.push(index);
    current.texts.push(text);
  });
  if (current.texts.length > 0) batches.push(current);
  return batches;
}
