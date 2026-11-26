// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCaptionView } from './live-view';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { cleanTranscript, holdMs, isLiveCaptionMessage, isLiveControlMessage, isLiveReportMessage } from '../shared/live';
import { liveView } from '../popup/popup-logic';

const settings = { ...DEFAULT_SETTINGS, mode: 'tr+en' as const };
const cap = (id: number, original: string, final: boolean, translation?: string) =>
  ({ type: 'LIVE_CAPTION', id, original, final, ...(translation ? { translation } : {}) }) as const;

describe('LiveCaptionView', () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());
  const make = () => new LiveCaptionView(settings, document, () => now);

  it('mounts as a floating bar without a video and shows interim → final → translation', () => {
    const v = make();
    v.handle(cap(1, 'So in college', false));
    expect(v.overlay.host.style.position).toBe('fixed');
    expect(v.overlay.displayedText).toBe('So in college');
    expect(v.overlay.shadow.querySelector('.tr')?.classList.contains('pending')).toBe(true);
    v.handle(cap(1, 'So in college I was a major.', true));
    expect(v.overlay.displayedText).toBe('So in college I was a major.');
    v.handle(cap(1, 'So in college I was a major.', true, 'Üniversitede bölümdüm.'));
    expect(v.overlay.displayedText).toBe('Üniversitede bölümdüm.\nSo in college I was a major.');
    v.destroy();
  });

  it('keeps a translated sentence readable before the next interim replaces it', () => {
    const v = make();
    v.handle(cap(1, 'Hello there.', true, 'Merhaba.'));
    now = 300;
    v.handle(cap(2, 'Next', false));
    expect(v.overlay.displayedText).toContain('Merhaba.');
    now = 1300;
    vi.advanceTimersByTime(1000);
    expect(v.overlay.displayedText).toBe('Next');
    v.destroy();
  });

  it('shows a late translation of the previous sentence over the next interim', () => {
    const v = make();
    v.handle(cap(1, 'First sentence.', true));
    now = 5000;
    v.handle(cap(2, 'Second', false));
    expect(v.overlay.displayedText).toBe('Second');
    v.handle(cap(1, 'First sentence.', true, 'İlk cümle.'));
    expect(v.overlay.displayedText).toBe('İlk cümle.\nFirst sentence.');
    v.handle(cap(0, 'Older.', true, 'Eski.')); // stale: ignored
    expect(v.overlay.displayedText).toBe('İlk cümle.\nFirst sentence.');
    v.destroy();
  });

  it('clears after the hold time, on discard and on LIVE_END', () => {
    const v = make();
    v.handle(cap(1, 'Done.', true, 'Bitti.'));
    vi.advanceTimersByTime(holdMs('Bitti.') + 10);
    expect(v.overlay.displayedText).toBe('');
    v.handle(cap(2, 'uh', false));
    v.handle({ type: 'LIVE_DISCARD', id: 2 });
    expect(v.overlay.displayedText).toBe('');
    v.handle(cap(3, 'Again.', true, 'Yine.'));
    v.handle({ type: 'LIVE_END' });
    expect(v.overlay.displayedText).toBe('');
    v.destroy();
  });
});

describe('live helpers', () => {
  it('cleans transcripts', () => {
    expect(cleanTranscript('  [Music]  ')).toBe('');
    expect(cleanTranscript('Hello (laughs) world')).toBe('Hello world');
    expect(cleanTranscript('...')).toBe('');
  });

  it('validates messages', () => {
    expect(isLiveControlMessage({ type: 'LIVE_START', tabId: 1, streamId: 'x' })).toBe(true);
    expect(isLiveControlMessage({ type: 'LIVE_START', tabId: 1, streamId: '' })).toBe(false);
    expect(isLiveReportMessage({ type: 'LIVE_TEXT', id: 1, text: 'a', final: true })).toBe(true);
    expect(isLiveReportMessage({ type: 'LIVE_STATUS', state: { phase: 'nope' } })).toBe(false);
    expect(isLiveCaptionMessage({ type: 'LIVE_CAPTION', id: 1, original: 'a', final: false, translation: 3 })).toBe(false);
    expect(isLiveCaptionMessage({ type: 'LIVE_END' })).toBe(true);
  });

  it('maps live state to the popup view', () => {
    expect(liveView(null, 1)).toEqual({ button: 'liveStart', on: false, status: null });
    expect(liveView({ phase: 'loading', tabId: 1, progress: 0.426 }, 1).status).toEqual({ key: 'liveLoading', arg: '43' });
    expect(liveView({ phase: 'listening', tabId: 1, device: 'wasm' }, 1).status).toEqual({ key: 'liveListening', arg: 'CPU' });
    expect(liveView({ phase: 'listening', tabId: 2 }, 1)).toMatchObject({ button: 'liveStop', status: { key: 'liveOtherTab' } });
    expect(liveView({ phase: 'error', error: 'denied' }, 1)).toMatchObject({ button: 'liveStart', status: { arg: 'denied' } });
  });
});
