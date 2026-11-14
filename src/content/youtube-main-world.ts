// MAIN-world script on www.youtube.com (document_start). Wraps fetch and XHR, and for every
// /api/timedtext response the player itself requested, posts the body to the isolated world.
// It never fetches caption URLs itself (YouTube requires a `pot` token).
// It also buffers the latest payloads per video (the isolated script loads later, at
// document_idle) and can try to switch on English captions through the player API.
import {
  MESSAGE_SOURCE,
  isPageMessage,
  type YtCaptionsMessage,
  type YtCcResultMessage,
} from '../shared/types';
import {
  parseTimedtextUrl,
  pickBestTrack,
  sameTrack,
  toPlayerTracks,
} from '../shared/youtube';

interface MoviePlayer {
  getOption?: (module: string, option: string) => unknown;
  setOption?: (module: string, option: string, value: unknown) => void;
  loadModule?: (name: string) => void;
}

const BUFFER_VIDEOS = 3;
const buffer = new Map<string, Map<string, YtCaptionsMessage>>();

function remember(msg: YtCaptionsMessage): void {
  let perVideo = buffer.get(msg.videoId);
  if (!perVideo) {
    perVideo = new Map();
    buffer.set(msg.videoId, perVideo);
    while (buffer.size > BUFFER_VIDEOS) {
      const oldest = buffer.keys().next();
      if (oldest.done) break;
      buffer.delete(oldest.value);
    }
  }
  perVideo.set(`${msg.lang}|${msg.kind}`, msg);
}

function handleBody(url: string, body: string): void {
  try {
    const params = parseTimedtextUrl(url, location.href);
    if (!params || !params.videoId || params.tlang) return;
    const trimmed = body.trimStart();
    if (!trimmed.startsWith('{') || !trimmed.includes('"events"')) return; // json3 only
    const msg: YtCaptionsMessage = {
      source: MESSAGE_SOURCE,
      type: 'YT_CAPTIONS',
      videoId: params.videoId,
      lang: params.lang,
      kind: params.kind,
      json: body,
    };
    remember(msg);
    window.postMessage(msg, location.origin);
  } catch {
    // never break the page
  }
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}

// --- fetch ---
const originalFetch = window.fetch;
if (typeof originalFetch === 'function') {
  const wrapped = function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const promise = originalFetch.apply(this, args);
    try {
      const url = urlOf(args[0]);
      if (url.includes('/api/timedtext')) {
        promise
          .then((res) => res.clone().text())
          .then((text) => handleBody(url, text))
          .catch(() => undefined);
      }
    } catch {
      // ignore
    }
    return promise;
  };
  window.fetch = wrapped as typeof fetch;
}

// --- XMLHttpRequest ---
const xhrUrls = new WeakMap<XMLHttpRequest, string>();
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
  try {
    xhrUrls.set(this, urlOf(args[1]));
  } catch {
    // ignore
  }
  return (originalOpen as (...a: unknown[]) => void).apply(this, args);
} as typeof XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
  try {
    const url = xhrUrls.get(this);
    if (url && url.includes('/api/timedtext')) {
      this.addEventListener('load', () => {
        try {
          let text: string | null = null;
          if (this.responseType === '' || this.responseType === 'text') text = this.responseText;
          else if (this.responseType === 'json' && this.response !== null) text = JSON.stringify(this.response);
          else if (this.responseType === 'arraybuffer' && this.response instanceof ArrayBuffer) {
            text = new TextDecoder().decode(this.response);
          }
          if (text) handleBody(this.responseURL || url, text);
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }
  return (originalSend as (...a: unknown[]) => void).apply(this, args);
} as typeof XMLHttpRequest.prototype.send;

// --- requests from the isolated world ---
function report(videoId: string, ok: boolean, detail?: string): void {
  const msg: YtCcResultMessage = { source: MESSAGE_SOURCE, type: 'YT_CC_RESULT', videoId, ok, detail };
  window.postMessage(msg, location.origin);
}

function enableCaptions(videoId: string, attempt = 0): void {
  try {
    const player = document.getElementById('movie_player') as unknown as MoviePlayer | null;
    if (!player || typeof player.getOption !== 'function' || typeof player.setOption !== 'function') {
      if (attempt < 10) setTimeout(() => enableCaptions(videoId, attempt + 1), 500);
      else report(videoId, false, 'noPlayer');
      return;
    }
    try {
      player.loadModule?.('captions');
    } catch {
      // ignore
    }
    const tracks = toPlayerTracks(player.getOption('captions', 'tracklist'));
    if (tracks.length === 0) {
      if (attempt < 10) setTimeout(() => enableCaptions(videoId, attempt + 1), 500);
      else report(videoId, false, 'noTracks');
      return;
    }
    const best = pickBestTrack(tracks);
    if (!best) {
      report(videoId, false, 'noEnglish');
      return;
    }
    let current: unknown;
    try {
      current = player.getOption('captions', 'track');
    } catch {
      current = undefined;
    }
    // Re-select even the same track when nothing was captured for this video yet.
    if (!sameTrack(current, best) || !buffer.has(videoId)) player.setOption('captions', 'track', best);
    report(videoId, true, best.kind === 'asr' ? 'asr' : 'manual');
  } catch {
    report(videoId, false, 'error');
  }
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!isPageMessage(msg)) return;
  if (msg.type === 'YT_READY') {
    const perVideo = buffer.get(msg.videoId);
    perVideo?.forEach((m) => window.postMessage(m, location.origin));
  } else if (msg.type === 'YT_ENABLE_CC') {
    enableCaptions(msg.videoId);
  }
});
