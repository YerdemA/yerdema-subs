import { describe, expect, it } from 'vitest';
import en from '../../_locales/en/messages.json';
import tr from '../../_locales/tr/messages.json';
import { detailMessageKey, sourceMessageKey, statusMessageKey } from './popup-logic';
import type { Status } from '../shared/types';

const statuses: Status[] = ['idle', 'no-video', 'no-subtitles', 'translating', 'active', 'error', 'disabled'];
const details = ['turnOnCC', 'noTrack', 'cors', 'loading', 'notPlaying', 'ad', 'translateFailed'];

describe('popup message keys', () => {
  it('maps statuses, details and sources to keys that exist in both locales', () => {
    const keys = [
      ...statuses.map((s) => statusMessageKey(s)),
      statusMessageKey(undefined),
      ...details.map((d) => detailMessageKey(d)!),
      sourceMessageKey('youtube-intercept')!,
      sourceMessageKey('youtube-dom')!,
      sourceMessageKey('html5')!,
    ];
    expect(statusMessageKey('no-video')).toBe('status_no_video');
    for (const k of keys) {
      expect(en, k).toHaveProperty(k);
      expect(tr, k).toHaveProperty(k);
    }
  });

  it('ignores unknown details and missing sources', () => {
    expect(detailMessageKey('whatever')).toBeNull();
    expect(detailMessageKey(undefined)).toBeNull();
    expect(sourceMessageKey(undefined)).toBeNull();
  });

  it('locales have the same keys', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it('every data-i18n key used in the popup exists', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const used = [...html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(5);
    for (const k of used) expect(en, k).toHaveProperty(k);
  });
});
