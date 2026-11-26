// Shows live (speech-to-text) captions in the page: over the largest visible video when there
// is one, otherwise as a floating bar. Only translated sentences are shown (English alone
// appears only when translation failed, in the dimmed "pending" style), newest wins.
import { holdMs, type LiveCaptionMessage } from '../shared/live';
import type { CurrentSubtitle, Settings } from '../shared/types';
import { Overlay } from './overlay';

type Caption = Extract<LiveCaptionMessage, { type: 'LIVE_CAPTION' }>;

/**
 * Latency trace (last entries) kept as a JSON attribute on the overlay host, readable from the
 * page/tests: content-script console output and event details do not reliably cross worlds.
 */
export const TRACE_ATTR = 'data-live-trace';
const TRACE_MAX = 100;

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
  private clearTimer: ReturnType<typeof setTimeout> | undefined;

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
        // Interim (partial) text is never shown; an older sentence never replaces a newer one.
        if (!msg.final) return;
        if (msg.id < this.shownId) {
          this.trace({ id: msg.id, dropped: true });
          return;
        }
        this.display(msg);
        break;
      case 'LIVE_DISCARD':
        break;
      case 'LIVE_END':
        this.clear();
        break;
    }
  }

  private display(msg: Caption): void {
    this.ensureMounted();
    this.shownId = msg.id;
    this.overlay.show({ original: msg.original, translation: msg.translation });
    if (this.clearTimer !== undefined) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => this.clear(), holdMs(msg.translation ?? msg.original));
    if (msg.endedAt !== undefined) {
      // Latency trace (read by the live E2E test): speech end → caption on screen.
      this.trace({
        id: msg.id,
        lagMs: this.now() - msg.endedAt,
        durationMs: msg.durationMs,
        translated: msg.translation !== undefined,
      });
    }
  }

  private readonly traces: Array<Record<string, unknown>> = [];

  private trace(data: Record<string, unknown>): void {
    this.traces.push(data);
    if (this.traces.length > TRACE_MAX) this.traces.shift();
    this.overlay.host.setAttribute(TRACE_ATTR, JSON.stringify(this.traces));
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
  }

  destroy(): void {
    if (this.clearTimer !== undefined) clearTimeout(this.clearTimer);
    this.overlay.destroy();
  }
}
