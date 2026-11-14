// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readCaptionText } from './youtube';
import { isPageMessage, MESSAGE_SOURCE } from '../../shared/types';

describe('readCaptionText', () => {
  it('joins visible caption segments and normalizes whitespace', () => {
    document.body.innerHTML = `
      <div id="movie_player">
        <div class="ytp-caption-window-container">
          <div class="caption-window">
            <span class="captions-text">
              <span class="caption-visual-line"><span class="ytp-caption-segment">so today we're</span></span>
              <span class="caption-visual-line"><span class="ytp-caption-segment">  going to   build</span></span>
            </span>
          </div>
        </div>
      </div>`;
    expect(readCaptionText(document.getElementById('movie_player')!)).toBe("so today we're going to build");
  });

  it('returns empty string without captions', () => {
    document.body.innerHTML = '<div id="movie_player"></div>';
    expect(readCaptionText(document)).toBe('');
  });
});

describe('isPageMessage', () => {
  it('validates the source field and shape', () => {
    expect(isPageMessage({ source: MESSAGE_SOURCE, type: 'YT_CAPTIONS', videoId: 'a', lang: 'en', kind: '', json: '{}' })).toBe(true);
    expect(isPageMessage({ source: 'other', type: 'YT_CAPTIONS', videoId: 'a', lang: 'en', kind: '', json: '{}' })).toBe(false);
    expect(isPageMessage({ source: MESSAGE_SOURCE, type: 'YT_CAPTIONS', videoId: 'a' })).toBe(false);
    expect(isPageMessage({ source: MESSAGE_SOURCE, type: 'YT_READY', videoId: 'a' })).toBe(true);
    expect(isPageMessage({ source: MESSAGE_SOURCE, type: 'YT_CC_RESULT', videoId: 'a', ok: false })).toBe(true);
    expect(isPageMessage('x')).toBe(false);
  });
});
