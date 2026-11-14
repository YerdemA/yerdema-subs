import { describe, expect, it } from 'vitest';
import manual from './__fixtures__/yt-manual.json3.json';
import asr from './__fixtures__/yt-asr.json3.json';
import {
  isJson3,
  json3ToCues,
  MERGE_LIMITS,
  mergeCues,
  parseAsrFragments,
  parseManualJson3,
  type Fragment,
} from './youtube-json3';

describe('parseManualJson3', () => {
  it('parses events, skipping ones without segs, newline-only and blank events', () => {
    const cues = parseManualJson3(manual);
    expect(cues.map((c) => c.text)).toEqual([
      'Welcome back to the channel.',
      "Today we're going to talk about black holes.",
      '[Music]',
      "They're really strange & fascinating.",
      "Let's get started!",
    ]);
    expect(cues[0]).toMatchObject({ id: 0, start: 1.2, end: 4 });
    expect(cues[4]).toMatchObject({ id: 4, start: 15, end: 19 });
    cues.forEach((c, i) => expect(c.id).toBe(i));
  });

  it('accepts a JSON string and returns [] for garbage', () => {
    expect(parseManualJson3(JSON.stringify(manual))).toHaveLength(5);
    expect(parseManualJson3('not json')).toEqual([]);
    expect(parseManualJson3({ foo: 1 })).toEqual([]);
    expect(parseManualJson3(null)).toEqual([]);
  });

  it('json3ToCues keeps manual captions as-is', () => {
    expect(json3ToCues(manual, '')).toEqual(parseManualJson3(manual));
  });
});

describe('isJson3', () => {
  it('detects json3 payloads', () => {
    expect(isJson3(manual)).toBe(true);
    expect(isJson3(JSON.stringify(asr))).toBe(true);
    expect(isJson3('<transcript></transcript>')).toBe(false);
    expect(isJson3({})).toBe(false);
  });
});

describe('ASR parsing + mergeCues', () => {
  it('explodes events into word fragments with offsets', () => {
    const frags = parseAsrFragments(asr);
    expect(frags[0]).toEqual({ start: 0.16, end: 0.48, text: 'so' });
    expect(frags.find((f) => f.text === 'today')?.start).toBeCloseTo(0.48);
    // newline-only append events are skipped
    expect(frags.some((f) => f.text === '')).toBe(false);
    // overlapping rolling events are clamped
    for (let i = 0; i < frags.length - 1; i++) {
      expect(frags[i]!.end).toBeLessThanOrEqual(Math.max(frags[i]!.start, frags[i + 1]!.start) + 1e-9);
    }
  });

  it('merges into sentence-like cues', () => {
    const cues = json3ToCues(asr, 'asr');
    expect(cues.map((c) => c.text)).toEqual([
      "so today we're going to build a browser extension.",
      'it will translate subtitles in real time',
      'after a long pause and then we keep talking without any punctuation at all for',
      'a very long time indeed friends',
    ]);
    expect(cues[0]!.start).toBeCloseTo(0.16);
    expect(cues[0]!.end).toBeCloseTo(3.88);
    expect(cues[1]!.end).toBeCloseTo(8.86);
    expect(cues[2]!.start).toBeCloseTo(10.5);
  });

  it('produces cues within the limits and non-overlapping', () => {
    const cues = json3ToCues(asr, 'asr');
    cues.forEach((c, i) => {
      expect(c.id).toBe(i);
      expect(c.text.length).toBeLessThanOrEqual(MERGE_LIMITS.maxChars);
      expect(c.end - c.start).toBeLessThanOrEqual(MERGE_LIMITS.maxDurationSec + 1e-9);
      expect(c.end).toBeGreaterThanOrEqual(c.start);
      const next = cues[i + 1];
      if (next) expect(c.end).toBeLessThanOrEqual(next.start + 1e-9);
    });
  });

  it('breaks at gaps > 1.2 s', () => {
    const frags: Fragment[] = [
      { start: 0, end: 0.5, text: 'hello' },
      { start: 0.5, end: 1, text: 'there' },
      { start: 2.3, end: 2.8, text: 'general' },
      { start: 2.8, end: 3.2, text: 'kenobi' },
    ];
    expect(mergeCues(frags).map((c) => c.text)).toEqual(['hello there', 'general kenobi']);
  });

  it('breaks at 120 chars', () => {
    const word = 'abcdefghi'; // 9 chars + space = 10 per word
    const frags: Fragment[] = Array.from({ length: 30 }, (_, i) => ({
      start: i * 0.1,
      end: i * 0.1 + 0.1,
      text: word,
    }));
    const cues = mergeCues(frags);
    expect(cues.length).toBeGreaterThan(1);
    cues.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(120));
    expect(cues.map((c) => c.text).join(' ')).toBe(Array(30).fill(word).join(' '));
  });

  it('breaks at sentence ends including ? and !', () => {
    const frags: Fragment[] = [
      { start: 0, end: 0.3, text: 'Really?' },
      { start: 0.3, end: 0.6, text: 'Yes!' },
      { start: 0.6, end: 0.9, text: 'Okay' },
    ];
    expect(mergeCues(frags).map((c) => c.text)).toEqual(['Really?', 'Yes!', 'Okay']);
  });

  it('end = min(next start, own end)', () => {
    const frags: Fragment[] = [
      { start: 0, end: 3, text: 'One.' },
      { start: 2, end: 4, text: 'Two.' },
    ];
    const cues = mergeCues(frags);
    expect(cues[0]).toMatchObject({ start: 0, end: 2 });
    expect(cues[1]).toMatchObject({ start: 2, end: 4 });
  });
});
