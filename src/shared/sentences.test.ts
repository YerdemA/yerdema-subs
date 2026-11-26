import { describe, expect, it } from 'vitest';
import { endsSentence, groupSentences, punctuatedRatio, translationUnit } from './sentences';
import type { Cue } from './types';

const mk = (items: Array<[number, number, string]>): Cue[] =>
  items.map(([start, end, text], id) => ({ id, start, end, text }));

describe('endsSentence', () => {
  it('detects sentence ends incl. closing quotes', () => {
    expect(endsSentence('Hello.')).toBe(true);
    expect(endsSentence('Really?')).toBe(true);
    expect(endsSentence('Stop!"')).toBe(true);
    expect(endsSentence('(laughs).)')).toBe(true);
  });
  it('treats trailing ellipsis and commas as a continuation', () => {
    expect(endsSentence('I was going to...')).toBe(false);
    expect(endsSentence('I was going to…')).toBe(false);
    expect(endsSentence('because')).toBe(false);
    expect(endsSentence('first,')).toBe(false);
  });
});

describe('groupSentences', () => {
  it('groups a sentence split across cues and closes small gaps', () => {
    const cues = groupSentences(
      mk([
        [0, 2, 'I went to the store'],
        [2.5, 4, 'because I needed milk.'],
        [4.2, 6, 'It was closed.'],
      ]),
    );
    expect(cues[0]!.sentence).toBe('I went to the store because I needed milk.');
    expect(cues[1]!.sentence).toBe(cues[0]!.sentence);
    expect(cues[0]!.end).toBe(2.5); // gap closed
    expect(cues[2]!.sentence).toBeUndefined();
    expect(translationUnit(cues[2]!)).toBe('It was closed.');
  });

  it('joins ellipsis continuations without the dots', () => {
    const cues = groupSentences(mk([[0, 1, 'I was going to...'], [1, 2, '...tell you.'], [2, 3, 'Okay.']]));
    expect(cues[0]!.sentence).toBe('I was going to tell you.');
  });

  it('breaks on long gaps, speaker dashes and limits', () => {
    const gap = groupSentences(mk([[0, 1, 'And then'], [5, 6, 'nothing.'], [6, 7, 'Done.']]));
    expect(gap[0]!.sentence).toBeUndefined();
    const dash = groupSentences(mk([[0, 1, 'Are you coming'], [1, 2, '- Yes.'], [2, 3, 'Good.']]));
    expect(dash[0]!.sentence).toBeUndefined();
    const many = groupSentences(
      mk([[0, 1, 'one'], [1, 2, 'two'], [2, 3, 'three'], [3, 4, 'four'], [4, 5, 'five.'], [5, 6, 'Six.']]),
    );
    expect(many[0]!.sentence).toBe('one two three four');
    expect(many[4]!.sentence).toBeUndefined();
  });

  it('does not group unpunctuated (auto-generated) tracks', () => {
    const asr = mk([[0, 2, 'so today we are going'], [2, 4, 'to talk about'], [4, 6, 'something new'], [6, 8, 'ok.']]);
    expect(punctuatedRatio(asr)).toBe(0.25);
    groupSentences(asr);
    expect(asr.every((c) => c.sentence === undefined)).toBe(true);
    expect(asr[0]!.end).toBe(2);
  });

  it('is idempotent and clears stale groups', () => {
    const cues = mk([[0, 1, 'Hello'], [1, 2, 'world.'], [2, 3, 'Bye.']]);
    groupSentences(cues);
    groupSentences(cues);
    expect(cues[0]!.sentence).toBe('Hello world.');
    cues[0]!.text = 'Hello.';
    groupSentences(cues);
    expect(cues[0]!.sentence).toBeUndefined();
  });
});
