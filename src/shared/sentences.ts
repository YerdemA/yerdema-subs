// Sentence integrity: groups consecutive cues that form one sentence so the sentence is
// translated as a whole (Turkish word order differs a lot from English, so translating
// halves separately produces broken output). Every cue of a group gets `sentence` = the
// joined group text; the translation of that text is shown for all of them.
import type { Cue } from './types';

export const SENTENCE_LIMITS = {
  /** max cues per group */
  maxCues: 4,
  /** max characters of the joined sentence */
  maxChars: 200,
  /** max seconds between the end of one cue and the start of the next */
  maxGapSec: 1.5,
  /** below this share of punctuated cue endings the track is treated as unpunctuated (ASR) */
  minPunctuatedRatio: 0.3,
} as const;

export type SentenceLimits = typeof SENTENCE_LIMITS;

// A trailing ellipsis means "continues in the next cue" in subtitle convention, so it is not
// an end. Closing quotes/brackets after the mark are allowed.
const ENDS_SENTENCE = /(?<![.…])[.!?](["'”’)\]]*)$|[♪]$/;
const TRAILING_ELLIPSIS = /(\.\.\.|…)(["'”’)\]]*)$/;
/** Next cue starts a new speaker / sound description. */
const STARTS_NEW_UNIT = /^(-|–|—|>>|\[|\()/;

export function endsSentence(text: string): boolean {
  const t = text.trim();
  if (TRAILING_ELLIPSIS.test(t)) return false;
  return ENDS_SENTENCE.test(t);
}

/** Share of cues whose text ends with sentence punctuation (incl. ellipsis). */
export function punctuatedRatio(cues: readonly Cue[]): number {
  if (cues.length === 0) return 0;
  let n = 0;
  for (const c of cues) {
    const t = c.text.trim();
    if (/[.!?…,;:♪]["'”’)\]]*$/.test(t)) n++;
  }
  return n / cues.length;
}

function joinTexts(texts: readonly string[]): string {
  return texts
    .map((t) => t.trim())
    .reduce((acc, t) => {
      if (!acc) return t;
      // "I was going to..." + "...say it" → "I was going to say it"
      const a = acc.replace(/(\.\.\.|…)$/, '');
      const b = t.replace(/^(\.\.\.|…)\s*/, '');
      return `${a} ${b}`;
    }, '');
}

/**
 * Sets `sentence` on cues that belong to a multi-cue sentence (and clears it elsewhere).
 * Within a group, short gaps are closed (each cue's end is extended to the next cue's start)
 * so the Turkish sentence does not blink off between its parts.
 * Cues must be sorted by start. Mutates and returns the array.
 */
export function groupSentences(cues: Cue[], limits: SentenceLimits = SENTENCE_LIMITS): Cue[] {
  for (const c of cues) delete c.sentence;
  if (punctuatedRatio(cues) < limits.minPunctuatedRatio) return cues;

  let group: Cue[] = [];
  const flush = (): void => {
    if (group.length > 1) {
      const sentence = joinTexts(group.map((c) => c.text));
      group.forEach((c, i) => {
        c.sentence = sentence;
        const next = group[i + 1];
        if (next && next.start > c.end) c.end = next.start;
      });
    }
    group = [];
  };

  for (const cue of cues) {
    const prev = group[group.length - 1];
    if (prev) {
      const joinedLen = joinTexts([...group.map((c) => c.text), cue.text]).length;
      const canJoin =
        !endsSentence(prev.text) &&
        !STARTS_NEW_UNIT.test(cue.text.trim()) &&
        cue.start >= prev.start &&
        cue.start - prev.end <= limits.maxGapSec &&
        group.length < limits.maxCues &&
        joinedLen <= limits.maxChars;
      if (!canJoin) flush();
    }
    group.push(cue);
    if (endsSentence(cue.text)) flush();
  }
  flush();
  return cues;
}

/** Text that is sent for translation for this cue. */
export function translationUnit(cue: Cue): string {
  return cue.sentence ?? cue.text;
}
