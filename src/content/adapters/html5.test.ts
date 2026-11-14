// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chooseTrack, pickVideo, textTrackCuesToCues } from './html5';

describe('html5 text cleanup (textTrackCuesToCues)', () => {
  it('strips tags and normalizes whitespace', () => {
    const cues = textTrackCuesToCues([
      { startTime: 2, endTime: 3, text: '<i>Hello</i>\n   <b>world</b>' },
      { startTime: 0, endTime: 1, text: '<c.yellow>First</c>  <v Bob>line</v>' },
      { startTime: 4, endTime: 5, text: '<00:00:04.500>Karaoke &amp; <u>timing</u>' },
    ]);
    expect(cues).toEqual([
      { id: 0, start: 0, end: 1, text: 'First line' },
      { id: 1, start: 2, end: 3, text: 'Hello world' },
      { id: 2, start: 4, end: 5, text: 'Karaoke & timing' },
    ]);
  });

  it('skips empty and non-text cues', () => {
    const cues = textTrackCuesToCues([
      { startTime: 0, endTime: 1, text: '   ' },
      { startTime: 1, endTime: 2, text: '<i></i>' },
      { startTime: 2, endTime: 3 },
      { startTime: 3, endTime: 4, text: 'ok' },
    ]);
    expect(cues.map((c) => c.text)).toEqual(['ok']);
  });
});

describe('chooseTrack', () => {
  it('prefers English subtitles/captions', () => {
    const tracks = [
      { kind: 'metadata', language: 'en', id: 'meta' },
      { kind: 'subtitles', language: 'de', id: 'de' },
      { kind: 'captions', language: 'en-US', id: 'en' },
    ];
    expect(chooseTrack(tracks)?.id).toBe('en');
  });

  it('falls back to the first subtitle track', () => {
    expect(chooseTrack([{ kind: 'chapters', language: 'en' }, { kind: 'subtitles', language: 'fr' }])?.language).toBe('fr');
    expect(chooseTrack([{ kind: 'descriptions', language: 'en' }])).toBeUndefined();
  });
});

describe('pickVideo', () => {
  function fakeVideo(opts: { paused: boolean; played: number; w: number; h: number; t?: number }): HTMLVideoElement {
    return {
      paused: opts.paused,
      played: { length: opts.played },
      currentTime: opts.t ?? 0,
      getBoundingClientRect: () => ({ width: opts.w, height: opts.h }),
    } as unknown as HTMLVideoElement;
  }

  it('picks the largest visible video that is playing or was played', () => {
    const neverPlayedBig = fakeVideo({ paused: true, played: 0, w: 1920, h: 1080 });
    const playingSmall = fakeVideo({ paused: false, played: 1, w: 320, h: 180 });
    const playedMedium = fakeVideo({ paused: true, played: 1, w: 640, h: 360 });
    const hidden = fakeVideo({ paused: false, played: 1, w: 0, h: 0 });
    expect(pickVideo([neverPlayedBig, playingSmall, playedMedium, hidden])).toBe(playedMedium);
    expect(pickVideo([neverPlayedBig, hidden])).toBeUndefined();
  });
});
