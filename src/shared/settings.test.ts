import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isSiteDisabled, normalizeSettings, withSite } from './settings';

describe('settings', () => {
  it('has the spec defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      enabled: true,
      mode: 'tr',
      fontSize: 24,
      bottomOffset: 10,
      bgOpacity: 0.6,
      hideOriginal: true,
      disabledSites: [],
    });
  });

  it('fills missing/invalid values with defaults', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ mode: 'de', enabled: 'yes', fontSize: 'big' })).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range values', () => {
    expect(normalizeSettings({ fontSize: 2, bottomOffset: 0, bgOpacity: -1 })).toMatchObject({
      fontSize: 14,
      bottomOffset: 2,
      bgOpacity: 0,
    });
    expect(normalizeSettings({ fontSize: 100, bottomOffset: 99, bgOpacity: 5 })).toMatchObject({
      fontSize: 48,
      bottomOffset: 40,
      bgOpacity: 1,
    });
    expect(normalizeSettings({ fontSize: NaN }).fontSize).toBe(24);
    expect(normalizeSettings({ fontSize: Infinity }).fontSize).toBe(24);
  });

  it('keeps valid values and coerces numeric strings', () => {
    expect(
      normalizeSettings({ enabled: false, mode: 'tr+en', fontSize: '30', bottomOffset: 15.5, bgOpacity: 0.25, hideOriginal: false }),
    ).toEqual({ enabled: false, mode: 'tr+en', fontSize: 30, bottomOffset: 15.5, bgOpacity: 0.25, hideOriginal: false, disabledSites: [] });
  });

  it('normalizes the per-site disable list', () => {
    expect(normalizeSettings({ disabledSites: ['Example.com', ' a.org ', 'example.com', 3, ''] }).disabledSites).toEqual([
      'example.com',
      'a.org',
    ]);
    expect(normalizeSettings({ disabledSites: 'x' }).disabledSites).toEqual([]);
  });

  it('withSite adds/removes hosts and isSiteDisabled matches exactly', () => {
    const list = withSite([], 'Example.com', true);
    expect(list).toEqual(['example.com']);
    expect(withSite(list, 'example.com', true)).toEqual(['example.com']);
    expect(withSite(list, 'example.com', false)).toEqual([]);
    const s = normalizeSettings({ disabledSites: list });
    expect(isSiteDisabled(s, 'EXAMPLE.com')).toBe(true);
    expect(isSiteDisabled(s, 'www.example.com')).toBe(false);
  });
});
