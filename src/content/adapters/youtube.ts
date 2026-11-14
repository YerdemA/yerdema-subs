// YouTube adapter (isolated world), SPEC §5.1.
// Primary: cues from intercepted /api/timedtext json3 (youtube-intercept).
// Fallback: read the rendered caption DOM (youtube-dom) when no timedtext arrives.
import { normalizeText } from '../../shared/cues';
import { isPageMessage, MESSAGE_SOURCE, type Settings, type StatusInfo, type YtCaptionsMessage, type YtRequestMessage } from '../../shared/types';
import { json3ToCues } from '../../shared/youtube-json3';
import { getWatchVideoId, payloadRank } from '../../shared/youtube';
import { CueSession } from '../cue-session';
import { sendTranslateMessage } from '../cue-translator';
import { Overlay } from '../overlay';
import { Detail, type Adapter } from './types';

const HIDE_STYLE_ID = 'yerdema-subs-hide-native';
const HIDE_CSS = '.ytp-caption-window-container { opacity: 0 !important; }';
const CAPTION_CONTAINER = '.ytp-caption-window-container';
const CAPTION_SEGMENT = '.ytp-caption-segment';
const DOM_FALLBACK_DELAY_MS = 4000;
const DOM_DEBOUNCE_MS = 350;
const ENABLE_CC_DELAY_MS = 1500;
const NO_SUBS_TIMEOUT_MS = 8000;

/** Reads the visible native caption text. */
export function readCaptionText(root: ParentNode): string {
  const parts = Array.from(root.querySelectorAll(CAPTION_SEGMENT)).map((el) => el.textContent ?? '');
  return normalizeText(parts.join(' '));
}

/** DOM fallback: translate the stabilized visible caption text. */
class DomCaptionMode {
  private observer: MutationObserver | null = null;
  private debounce = 0;
  private waitTimer = 0;
  private lastText = '';
  private readonly cache = new Map<string, string>();
  private failed = false;
  private destroyed = false;

  constructor(
    private readonly player: HTMLElement,
    private readonly overlay: Overlay,
  ) {
    this.attach();
  }

  get status(): StatusInfo {
    return this.failed
      ? { status: 'error', detail: Detail.translateFailed, source: 'youtube-dom' }
      : { status: 'active', source: 'youtube-dom' };
  }

  private attach(): void {
    const container = this.player.querySelector(CAPTION_CONTAINER);
    if (!container) {
      this.waitTimer = window.setTimeout(() => this.attach(), 500);
      return;
    }
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(container, { childList: true, subtree: true, characterData: true });
    this.schedule();
  }

  private schedule(): void {
    window.clearTimeout(this.debounce);
    // Clear immediately when the captions disappear; otherwise wait for the text to settle.
    if (readCaptionText(this.player) === '') {
      this.lastText = '';
      this.overlay.show(null);
      return;
    }
    this.debounce = window.setTimeout(() => this.readAndTranslate(), DOM_DEBOUNCE_MS);
  }

  private readAndTranslate(): void {
    const text = readCaptionText(this.player);
    if (text === this.lastText) return;
    this.lastText = text;
    if (!text) {
      this.overlay.show(null);
      return;
    }
    const cached = this.cache.get(text);
    this.overlay.show({ original: text, translation: cached });
    if (cached !== undefined) return;
    void sendTranslateMessage([text]).then((res) => {
      if (this.destroyed) return;
      const tr = res.ok ? res.translations[0] : undefined;
      if (tr) {
        this.failed = false;
        this.cache.set(text, tr);
        if (this.lastText === text) this.overlay.show({ original: text, translation: tr });
      } else {
        this.failed = true;
      }
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    window.clearTimeout(this.debounce);
    window.clearTimeout(this.waitTimer);
  }
}

export class YouTubeAdapter implements Adapter {
  private videoId: string | null = null;
  private overlay: Overlay;
  private session: CueSession | null = null;
  private dom: DomCaptionMode | null = null;
  private current: { lang: string; kind: string; rank: number } | null = null;
  private ccResult: { ok: boolean; detail?: string } | null = null;
  private timers: number[] = [];
  private pollTimer = 0;
  private captionsSeenAt = 0;
  private startedAt = 0;
  private adObserver: MutationObserver | null = null;
  private observedPlayer: HTMLElement | null = null;
  private adShowing = false;

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!isPageMessage(msg)) return;
    if (msg.type === 'YT_CAPTIONS') this.onCaptions(msg);
    else if (msg.type === 'YT_CC_RESULT' && msg.videoId === this.videoId) {
      this.ccResult = { ok: msg.ok, detail: msg.detail };
    }
  };
  private readonly onNavigate = (): void => this.reset();

  constructor(private settings: Settings) {
    this.overlay = new Overlay(settings);
    window.addEventListener('message', this.onMessage);
    document.addEventListener('yt-navigate-finish', this.onNavigate);
    window.addEventListener('popstate', this.onNavigate);
    this.applyHideStyle();
    this.reset();
  }

  getStatus(): StatusInfo {
    if (!this.videoId) return { status: 'no-video' };
    if (this.session) {
      const status = this.session.status;
      return {
        status,
        source: 'youtube-intercept',
        ...(status === 'error' ? { detail: Detail.translateFailed } : {}),
      };
    }
    if (this.dom) return this.dom.status;
    if (this.ccResult && !this.ccResult.ok) {
      return { status: 'no-subtitles', detail: Detail.turnOnCC };
    }
    if (Date.now() - this.startedAt > NO_SUBS_TIMEOUT_MS) {
      return { status: 'no-subtitles', detail: Detail.turnOnCC };
    }
    return { status: 'idle', detail: Detail.loading };
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.overlay.setSettings(settings);
    this.applyHideStyle();
  }

  private applyHideStyle(): void {
    const existing = document.getElementById(HIDE_STYLE_ID);
    if (this.settings.hideOriginal) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = HIDE_STYLE_ID;
      style.textContent = HIDE_CSS;
      (document.head ?? document.documentElement).append(style);
    } else {
      existing?.remove();
    }
  }

  private post(type: YtRequestMessage['type'], videoId: string): void {
    const msg: YtRequestMessage = { source: MESSAGE_SOURCE, type, videoId };
    window.postMessage(msg, location.origin);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearVideoState(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    window.clearInterval(this.pollTimer);
    this.pollTimer = 0;
    this.session?.destroy();
    this.session = null;
    this.dom?.destroy();
    this.dom = null;
    this.current = null;
    this.ccResult = null;
    this.captionsSeenAt = 0;
    this.overlay.show(null);
  }

  /** Full per-video reset (initial load and SPA navigation). */
  private reset(): void {
    const videoId = getWatchVideoId(location.href);
    if (videoId === this.videoId && (this.session || this.dom || this.pollTimer)) return;
    this.clearVideoState();
    this.videoId = videoId;
    this.startedAt = Date.now();
    if (!videoId) return;

    this.post('YT_READY', videoId); // replay anything the MAIN world already captured
    this.later(() => {
      // Enable CC if nothing arrived yet, or upgrade ASR to a manual English track if one exists.
      if (this.videoId === videoId && (!this.session || this.current?.kind === 'asr')) {
        this.post('YT_ENABLE_CC', videoId);
      }
    }, ENABLE_CC_DELAY_MS);

    // Poll: mount the overlay inside #movie_player, watch ads, decide on DOM fallback.
    this.pollTimer = window.setInterval(() => this.tick(), 500);
    this.tick();
  }

  private player(): HTMLElement | null {
    return document.getElementById('movie_player');
  }

  private video(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video') ??
      document.querySelector<HTMLVideoElement>('#movie_player video');
  }

  private tick(): void {
    const player = this.player();
    if (!player) return;
    if (this.overlay.host.parentElement !== player) this.overlay.mountInside(player);
    this.watchAds(player);

    if (this.session) return;
    const visible = readCaptionText(player) !== '';
    if (visible && !this.captionsSeenAt) this.captionsSeenAt = Date.now();
    if (!this.dom && this.captionsSeenAt && Date.now() - this.captionsSeenAt >= DOM_FALLBACK_DELAY_MS) {
      this.dom = new DomCaptionMode(player, this.overlay);
    }
  }

  private watchAds(player: HTMLElement): void {
    if (this.observedPlayer === player) return;
    this.adObserver?.disconnect();
    this.observedPlayer = player;
    const update = (): void => {
      this.adShowing = player.classList.contains('ad-showing');
      this.overlay.setVisible(!this.adShowing);
    };
    this.adObserver = new MutationObserver(update);
    this.adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    update();
  }

  private onCaptions(msg: YtCaptionsMessage): void {
    if (!this.videoId || msg.videoId !== this.videoId) return;
    const rank = payloadRank(msg.lang, msg.kind);
    if (this.current && (rank > this.current.rank || (this.current.lang === msg.lang && this.current.kind === msg.kind))) {
      return; // keep the better (or identical) track already in use
    }
    const cues = json3ToCues(msg.json, msg.kind);
    if (cues.length === 0) return;
    const video = this.video();
    const player = this.player();
    if (!video || !player) {
      // Player not ready yet: retry shortly.
      this.later(() => this.onCaptions(msg), 300);
      return;
    }
    if (this.overlay.host.parentElement !== player) this.overlay.mountInside(player);
    this.current = { lang: msg.lang, kind: msg.kind, rank };
    this.dom?.destroy();
    this.dom = null;
    this.session?.destroy();
    const videoKey = `yt:${msg.videoId}:${msg.lang}${msg.kind === 'asr' ? ':asr' : ''}`;
    this.session = new CueSession(video, this.overlay, videoKey);
    this.session.setCues(cues);
    this.overlay.setVisible(!this.adShowing);
  }

  destroy(): void {
    this.clearVideoState();
    window.removeEventListener('message', this.onMessage);
    document.removeEventListener('yt-navigate-finish', this.onNavigate);
    window.removeEventListener('popstate', this.onNavigate);
    this.adObserver?.disconnect();
    this.overlay.destroy();
    document.getElementById(HIDE_STYLE_ID)?.remove();
    this.videoId = null;
  }
}
