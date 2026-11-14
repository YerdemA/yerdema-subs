// Cue helpers: text normalization and active-cue lookup.
import type { Cue } from './types';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lrm: '',
  rlm: '',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Collapses all whitespace (incl. newlines) to single spaces and trims. */
export function normalizeText(text: string): string {
  return text.replace(/[\s ​]+/g, ' ').trim();
}

/** Strips WebVTT/HTML-ish tags: <i>, <b>, <u>, <c.cls>, <v Speaker>, <00:00:01.000>, <ruby>... */
export function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/** Full cleanup for a raw caption text (VTT cue text, json3 segment text...). */
export function cleanCueText(raw: string): string {
  return normalizeText(decodeEntities(stripTags(raw)));
}

/**
 * Binary search for the cue active at `time`. Cues must be sorted by start.
 * A cue is active when start <= time < end. When cues overlap, the latest-starting
 * cue that is still active wins. Returns the index or -1.
 */
export function findActiveCueIndex(cues: readonly Cue[], time: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let candidate = -1;
  // last cue with start <= time
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cue = cues[mid];
    if (cue === undefined) break;
    if (cue.start <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // walk back a little for overlapping cues (bounded so it stays O(log n) in practice)
  for (let i = candidate, steps = 0; i >= 0 && steps < 8; i--, steps++) {
    const cue = cues[i];
    if (cue !== undefined && time < cue.end) return i;
  }
  return -1;
}

export function findActiveCue(cues: readonly Cue[], time: number): Cue | undefined {
  const i = findActiveCueIndex(cues, time);
  return i >= 0 ? cues[i] : undefined;
}

/** Sorts by start then end and re-assigns sequential ids. */
export function sortCues(cues: Cue[]): Cue[] {
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  cues.forEach((c, i) => (c.id = i));
  return cues;
}

/**
 * Index order in which cues should be translated: first those from `time - 5s` forward for
 * the next `windowSec` seconds, then the remaining cues after that window, then the earlier ones.
 */
export function prioritizeCueIndices(cues: readonly Cue[], time: number, windowSec = 60): number[] {
  const from = time - 5;
  const to = time + windowSec;
  const first: number[] = [];
  const after: number[] = [];
  const before: number[] = [];
  cues.forEach((c, i) => {
    if (c.end >= from && c.start <= to) first.push(i);
    else if (c.start > to) after.push(i);
    else before.push(i);
  });
  return [...first, ...after, ...before];
}
