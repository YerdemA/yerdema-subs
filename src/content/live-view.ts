// Shows live (speech-to-text) captions in the page: over the largest visible video when there
// is one, otherwise as a floating bar. Decides what to show when interim English text, final
// text and late translations arrive in different orders.
import { holdMs, minReadMs, type LiveCaptionMessage } from '../shared/live';
import type { CurrentSubtitle, Settings } from '../shared/types';
import { Overlay } from './overlay';

type Caption = Extract<LiveCaptionMessage, { type: 'LIVE_CAPTION' }>;

/** Interim captions are cleared after this long without an update (speech stopped abruptly). */
const INTERIM_TIMEOUT_MS = 10000;

export function pickLiveTarget(doc: Document): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  const vw = doc.defaultView?.innerWidth ?? 0;
  const vh = doc.defaultView?.innerHeight ?? 0;
  for (const v of Array.from(doc.getElementsByTagName('video'))) {
    const r = v.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const area = w * h;
    if (area > bestArea && area >= 200 * 100) {
      best = v;
      bestArea = area;
    }
  }
  return best;
}

export class LiveCaptionView {
  readonly overlay: Overlay;
  private target: HTMLVideoElement | 'floating' | null = null;
  private shownId = 0;
  private shownFinal = false;
  private shownAt = 0;
  private shownText = '';
  private clearTimer: ReturnType<typeof setTimeout> | undefined;
  private deferTimer: ReturnType<typeof setTimeout> | undefined;
  private deferred: Caption | null = null;

  constructor(
    settings: Settings,
    private readonly doc: Document = document,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.overlay = new Overlay(settings, doc);
  }

  get current(): CurrentSubtitle | null {
    return this.overlay.current;
  }

  setSettings(settings: Settings): void {
    this.overlay.setSettings(settings);
  }

  handle(msg: LiveCaptionMessage): void {
    switch (msg.type) {
      case 'LIVE_CAPTION':
        if (msg.final) this.onFinal(msg);
        else this.onInterim(msg);
        break;
      case 'LIVE_DISCARD':
        if (msg.id === this.shownId && !this.shownFinal) this.clear();
        if (this.deferred?.id === msg.id) this.deferred = null;
        break;
      case 'LIVE_END':
        this.clear();
        break;
    }
  }

  private onInterim(msg: Caption): void {
    if (msg.id < this.shownId || (msg.id === this.shownId && this.shownFinal)) return;
    if (msg.id > this.shownId && this.shownFinal) {
      // Let the previous sentence be read before the next one's English replaces it.
      const wait = minReadMs(this.shownText) - (this.now() - this.shownAt);
      if (wait > 0) {
        this.deferred = msg;
        if (this.deferTimer === undefined) {
          this.deferTimer = setTimeout(() => {
            this.deferTimer = undefined;
            const d = this.deferred;
            this.deferred = null;
            if (d) this.onInterim(d);
          }, wait);
        }
        return;
      }
    }
    this.display(msg, false, INTERIM_TIMEOUT_MS);
  }

  private onFinal(msg: Caption): void {
    // A late translation of an earlier sentence beats the next sentence's English interim.
    const lateButUseful = msg.id < this.shownId && !this.shownFinal && !!msg.translation;
    if (msg.id < this.shownId && !lateButUseful) return;
    if (this.deferred && this.deferred.id <= msg.id) this.deferred = null;
    const text = msg.translation ?? msg.original;
    this.display(msg, true, holdMs(text));
    this.shownAt = this.now();
    this.shownText = text;
  }

  private display(msg: Caption, final: boolean, timeoutMs: number): void {
    this.ensureMounted();
    this.shownId = msg.id;
    this.shownFinal = final;
    this.overlay.show({ original: msg.original, translation: msg.translation });
    if (this.clearTimer !== undefined) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => this.clear(), timeoutMs);
  }

  private ensureMounted(): void {
    const video = pickLiveTarget(this.doc);
    const want = video ?? 'floating';
    if (want === this.target && this.overlay.host.isConnected) return;
    this.target = want;
    if (want === 'floating') this.overlay.mountFloating(this.doc);
    else this.overlay.mountOver(want);
  }

  private clear(): void {
    if (this.clearTimer !== undefined) clearTimeout(this.clearTimer);
    this.clearTimer = undefined;
    this.overlay.show(null);
    this.shownFinal = true;
    this.shownText = '';
    this.shownAt = 0;
  }

  destroy(): void {
    if (this.clearTimer !== undefined) clearTimeout(this.clearTimer);
    if (this.deferTimer !== undefined) clearTimeout(this.deferTimer);
    this.overlay.destroy();
  }
}
