import { describe, expect, it } from 'vitest';
import {
  getWatchVideoId,
  isEnglish,
  parseTimedtextUrl,
  payloadRank,
  pickBestTrack,
  sameTrack,
  toPlayerTracks,
} from './youtube';

describe('getWatchVideoId', () => {
  it('extracts v on /watch only', () => {
    expect(getWatchVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ');
    expect(getWatchVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeNull();
    expect(getWatchVideoId('https://www.youtube.com/')).toBeNull();
    expect(getWatchVideoId('https://www.youtube.com/watch')).toBeNull();
    expect(getWatchVideoId('not a url')).toBeNull();
  });
});

describe('parseTimedtextUrl', () => {
  it('reads v/lang/kind/tlang', () => {
    expect(
      parseTimedtextUrl('/api/timedtext?v=abc123XYZ_-&ei=x&caps=asr&opi=1&xoaf=5&lang=en&kind=asr&fmt=json3&pot=TOKEN'),
    ).toEqual({ videoId: 'abc123XYZ_-', lang: 'en', kind: 'asr', tlang: '' });
    expect(parseTimedtextUrl('https://www.youtube.com/api/timedtext?v=a&lang=en&tlang=tr')?.tlang).toBe('tr');
    expect(parseTimedtextUrl('https://www.youtube.com/youtubei/v1/player')).toBeNull();
  });
});

describe('track choice', () => {
  it('isEnglish', () => {
    expect(isEnglish('en')).toBe(true);
    expect(isEnglish('en-US')).toBe(true);
    expect(isEnglish('en_GB')).toBe(true);
    expect(isEnglish('es')).toBe(false);
    expect(isEnglish('eng')).toBe(false);
  });

  it('ranks manual EN < ASR EN < other manual < other ASR', () => {
    const ranks = [payloadRank('en', ''), payloadRank('en', 'asr'), payloadRank('de', ''), payloadRank('de', 'asr')];
    expect(ranks).toEqual([0, 1, 2, 3]);
  });

  it('prefers manual English over ASR English', () => {
    const tracks = toPlayerTracks([
      { languageCode: 'en', kind: 'asr', vss_id: 'a.en' },
      { languageCode: 'de', vss_id: '.de' },
      { languageCode: 'en-GB', vss_id: '.en-GB' },
      { nope: true },
    ]);
    expect(tracks).toHaveLength(3);
    expect(pickBestTrack(tracks)?.vss_id).toBe('.en-GB');
    expect(pickBestTrack(tracks.slice(0, 2))?.vss_id).toBe('a.en');
    expect(pickBestTrack([{ languageCode: 'fr' }])).toBeUndefined();
  });

  it('sameTrack compares language and asr-ness', () => {
    expect(sameTrack({ languageCode: 'en', kind: 'asr' }, { languageCode: 'en', kind: 'asr' })).toBe(true);
    expect(sameTrack({ languageCode: 'en' }, { languageCode: 'en', kind: 'asr' })).toBe(false);
    expect(sameTrack({}, { languageCode: 'en' })).toBe(false);
    expect(sameTrack(undefined, { languageCode: 'en' })).toBe(false);
  });
});
