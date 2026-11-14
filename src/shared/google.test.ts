import { describe, expect, it } from 'vitest';
import sample from './__fixtures__/google-sample.json';
import {
  alignTranslations,
  buildGoogleUrl,
  GOOGLE_ENDPOINTS,
  parseGoogleBody,
  parseGoogleResponse,
} from './google';

describe('buildGoogleUrl', () => {
  it('builds the gtx URL with encoded q', () => {
    const url = buildGoogleUrl('Hello world?\nYes & no', 'tr');
    expect(url).toBe(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=Hello%20world%3F%0AYes%20%26%20no',
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('q')).toBe('Hello world?\nYes & no');
    expect(parsed.searchParams.get('dt')).toBe('t');
  });

  it('supports the fallback endpoint', () => {
    const url = buildGoogleUrl('Hi', 'tr', GOOGLE_ENDPOINTS[1]);
    expect(url.startsWith('https://clients5.google.com/translate_a/single?client=dict-chrome-ex&')).toBe(true);
  });
});

describe('parseGoogleResponse', () => {
  it('concatenates all segments of the captured fixture', () => {
    const text = parseGoogleResponse(sample);
    expect(text).toBe(
      'Selam Dünya.\nBugün nasılsın?\nBu bir deneme cümlesidir.\nBundan sonra ne olacağını göreceğiz.',
    );
  });

  it('returns null for unexpected shapes', () => {
    expect(parseGoogleResponse(null)).toBeNull();
    expect(parseGoogleResponse({})).toBeNull();
    expect(parseGoogleResponse([null])).toBeNull();
  });

  it('parseGoogleBody returns null for the HTML rate-limit page', () => {
    expect(parseGoogleBody('<html><title>Sorry...</title></html>')).toBeNull();
    expect(parseGoogleBody(JSON.stringify(sample))).toContain('Selam');
  });

  it('handles a line split across two segments', () => {
    const data = [[['Birinci cümle. ', 'First sentence. '], ['İkinci cümle.\n', 'Second sentence.\n'], ['Üçüncü', 'Third']]];
    const text = parseGoogleResponse(data);
    expect(text).toBe('Birinci cümle. İkinci cümle.\nÜçüncü');
    expect(alignTranslations(text!, 2)).toEqual(['Birinci cümle. İkinci cümle.', 'Üçüncü']);
  });
});

describe('alignTranslations', () => {
  it('aligns when the line count matches', () => {
    const text = parseGoogleResponse(sample)!;
    expect(alignTranslations(text, 4)).toEqual([
      'Selam Dünya.',
      'Bugün nasılsın?',
      'Bu bir deneme cümlesidir.',
      'Bundan sonra ne olacağını göreceğiz.',
    ]);
  });

  it('returns null on mismatch', () => {
    expect(alignTranslations('bir\niki', 3)).toBeNull();
    expect(alignTranslations('bir\niki\nüç\ndört', 3)).toBeNull();
  });

  it('ignores trailing newlines and CRLF', () => {
    expect(alignTranslations('bir\r\niki\n', 2)).toEqual(['bir', 'iki']);
  });

  it('single item never mismatches', () => {
    expect(alignTranslations('bir\niki', 1)).toEqual(['bir iki']);
  });
});
