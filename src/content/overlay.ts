// Shadow-DOM subtitle overlay. Two mounting strategies:
//  - mountInside(container): host fills a positioned container (YouTube #movie_player)
//  - mountOver(video): host is fixed-positioned over a <video> and follows it
//    (ResizeObserver + scroll/resize + fullscreen re-mount)
import { bottomOffsetFromDrag } from '../shared/position';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/settings';
import type { Settings } from '../shared/types';

export interface OverlayOptions {
  /** Called with the new `bottomOffset` after the user drags (or double-click resets) the box. */
  onReposition?: (bottomOffset: number) => void;
}

const DRAG_THRESHOLD_PX = 3;

const persistOffset = (bottomOffset: number): void => {
  saveSettings({ bottomOffset }).catch(() => {
    /* storage unavailable (e.g. extension reloaded); position stays for this page only */
  });
};

export interface OverlayContent {
  /** English text */
  original: string;
  /** Turkish text; undefined/empty while the translation is pending */
  translation?: string;
}

const STYLE = `
:host {
  all: initial;
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2147483647;
  overflow: hidden;
}
.wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--ys-bottom, 10%);
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.box {
  max-width: 80%;
  box-sizing: border-box;
  padding: 0.12em 0.55em 0.18em;
  border-radius: 0.3em;
  background: rgba(0, 0, 0, var(--ys-bg, 0.6));
  color: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-align: center;
  line-height: 1.3;
  text-shadow: 0 0 2px #000, 0 1px 3px rgba(0, 0, 0, 0.9);
  white-space: pre-line;
  overflow-wrap: anywhere;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.box.dragging { cursor: grabbing; outline: 1px dashed rgba(255, 255, 255, 0.6); }
[hidden] { display: none !important; }
.tr { display: block; font-size: var(--ys-fs, 24px); font-weight: 500; }
.en { display: block; font-size: calc(var(--ys-fs, 24px) * 0.75); opacity: 0.78; margin-top: 0.15em; }
.pending { font-style: italic; opacity: 0.7; font-weight: 400; }
`;

export class Overlay {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly wrap: HTMLElement;
  private readonly box: HTMLElement;
  private readonly trLine: HTMLElement;
  private readonly enLine: HTMLElement;
  private settings: Settings;
  private content: OverlayContent | null = null;
  private visible = true;
  private lastKey: string | null = null;
  private cleanupMount: (() => void) | null = null;
  private readonly onReposition: (bottomOffset: number) => void;
  private drag: { pointerId: number; startY: number; startBottom: number; offset: number | null } | null =
    null;

  constructor(settings: Settings, doc: Document = document, options: OverlayOptions = {}) {
    this.settings = settings;
    this.onReposition = options.onReposition ?? persistOffset;
    this.host = doc.createElement('yerdema-subs-overlay');
    this.host.setAttribute('data-yerdema-subs', '');
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLE;
    this.wrap = doc.createElement('div');
    this.wrap.className = 'wrap';
    this.box = doc.createElement('div');
    this.box.className = 'box';
    this.trLine = doc.createElement('span');
    this.trLine.className = 'tr';
    this.enLine = doc.createElement('span');
    this.enLine.className = 'en';
    this.box.append(this.trLine, this.enLine);
    this.wrap.append(this.box);
    this.root.append(style, this.wrap);
    this.applySettings();
    this.render();
    this.bindDrag();
  }

  get shadow(): ShadowRoot {
    return this.root;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.applySettings();
    this.lastKey = null;
    this.render();
  }

  /** Shows content (null clears). Only touches the DOM when something changed. */
  show(content: OverlayContent | null): void {
    this.content = content;
    this.render();
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.lastKey = null;
    this.render();
  }

  /** Subtitle currently on screen, or null. */
  get current(): OverlayContent | null {
    const c = this.content;
    if (!this.visible || !this.settings.enabled || !c || !c.original.trim()) return null;
    return { original: c.original, translation: c.translation?.trim() || undefined };
  }

  /** Text currently displayed (for tests / debugging). */
  get displayedText(): string {
    if (this.wrap.hidden || this.box.hidden) return '';
    return [this.trLine, this.enLine]
      .filter((el) => !el.hidden)
      .map((el) => el.textContent ?? '')
      .join('\n')
      .trim();
  }

  /** Whether the user is currently dragging the subtitle box. */
  get isDragging(): boolean {
    return this.drag !== null;
  }

  private bindDrag(): void {
    const box = this.box;
    // Keep clicks on the subtitle from reaching the page/player (e.g. YouTube play/pause).
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerup'] as const) {
      box.addEventListener(type, (e) => e.stopPropagation());
    }
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        box.setPointerCapture(e.pointerId);
      } catch {
        /* jsdom / detached */
      }
      this.drag = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startBottom: box.getBoundingClientRect().bottom,
        offset: null,
      };
    });
    box.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      const dy = e.clientY - d.startY;
      if (d.offset === null && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      box.classList.add('dragging');
      const rect = this.host.getBoundingClientRect();
      d.offset = bottomOffsetFromDrag(rect.top, rect.height, d.startBottom + dy);
      this.host.style.setProperty('--ys-bottom', `${d.offset}%`);
    });
    const end = (e: PointerEvent): void => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      this.drag = null;
      box.classList.remove('dragging');
      if (d.offset !== null && d.offset !== this.settings.bottomOffset) this.commitOffset(d.offset);
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.commitOffset(DEFAULT_SETTINGS.bottomOffset);
    });
  }

  private commitOffset(offset: number): void {
    this.settings = { ...this.settings, bottomOffset: offset };
    this.applySettings();
    this.onReposition(offset);
  }

  private applySettings(): void {
    const s = this.settings;
    this.host.style.setProperty('--ys-fs', `${s.fontSize}px`);
    this.host.style.setProperty('--ys-bottom', `${s.bottomOffset}%`);
    this.host.style.setProperty('--ys-bg', String(s.bgOpacity));
  }

  private render(): void {
    const c = this.content;
    const show = this.visible && this.settings.enabled && c !== null && c.original.trim() !== '';
    const key = show && c ? `${this.settings.mode}|${c.translation ?? ''}|${c.original}` : '';
    if (key === this.lastKey) return;
    this.lastKey = key;

    if (!show || !c) {
      this.wrap.hidden = true;
      return;
    }
    this.wrap.hidden = false;
    const tr = c.translation?.trim();
    if (!tr) {
      // Translation pending (or failed): show the English text dimmed/italic.
      this.trLine.textContent = c.original;
      this.trLine.classList.add('pending');
      this.enLine.hidden = true;
      this.enLine.textContent = '';
      return;
    }
    this.trLine.textContent = tr;
    this.trLine.classList.remove('pending');
    if (this.settings.mode === 'tr+en') {
      this.enLine.textContent = c.original;
      this.enLine.hidden = false;
    } else {
      this.enLine.textContent = '';
      this.enLine.hidden = true;
    }
  }

  /** Mounts the overlay filling `container` (which must be positioned). */
  mountInside(container: HTMLElement): void {
    this.unmount();
    this.host.style.position = 'absolute';
    this.host.style.inset = '0';
    container.append(this.host);
    this.cleanupMount = () => this.host.remove();
  }

  /** Positions the overlay over `video` and keeps following it. */
  mountOver(video: HTMLVideoElement): void {
    this.unmount();
    const doc = video.ownerDocument;
    const win = doc.defaultView ?? window;
    this.host.style.position = 'fixed';
    this.host.style.inset = 'auto';

    const place = (): void => {
      const fs = doc.fullscreenElement;
      // Re-mount inside the fullscreen element (top layer) when the video is inside it.
      const parent: Element =
        fs && fs !== video && fs.contains(video) ? fs : (doc.body ?? doc.documentElement);
      if (this.host.parentNode !== parent) parent.append(this.host);
      const rect = video.getBoundingClientRect();
      const st = this.host.style;
      st.left = `${rect.left}px`;
      st.top = `${rect.top}px`;
      st.width = `${rect.width}px`;
      st.height = `${rect.height}px`;
      st.display = rect.width > 0 && rect.height > 0 ? 'block' : 'none';
    };

    let frame = 0;
    const schedule = (): void => {
      if (frame) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };

    place();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(video);
    win.addEventListener('scroll', schedule, { capture: true, passive: true });
    win.addEventListener('resize', schedule, { passive: true });
    doc.addEventListener('fullscreenchange', place);
    // Layout can also change without resize events (e.g. sticky players); cheap periodic check.
    const timer = win.setInterval(place, 1000);

    this.cleanupMount = () => {
      ro?.disconnect();
      win.removeEventListener('scroll', schedule, { capture: true });
      win.removeEventListener('resize', schedule);
      doc.removeEventListener('fullscreenchange', place);
      win.clearInterval(timer);
      if (frame) win.cancelAnimationFrame(frame);
      this.host.remove();
    };
  }

  /**
   * Floating caption bar over the whole viewport (no <video> to attach to, e.g. podcasts or
   * audio players). Follows the fullscreen element so it stays visible in fullscreen.
   */
  mountFloating(doc: Document = document): void {
    this.unmount();
    this.host.style.position = 'fixed';
    this.host.style.inset = '0';
    for (const k of ['left', 'top', 'width', 'height', 'display'] as const) this.host.style.removeProperty(k);
    const place = (): void => {
      const parent: Element = doc.fullscreenElement ?? doc.body ?? doc.documentElement;
      if (this.host.parentNode !== parent) parent.append(this.host);
    };
    place();
    doc.addEventListener('fullscreenchange', place);
    this.cleanupMount = () => {
      doc.removeEventListener('fullscreenchange', place);
      this.host.remove();
    };
  }

  unmount(): void {
    this.cleanupMount?.();
    this.cleanupMount = null;
  }

  destroy(): void {
    this.unmount();
    this.content = null;
  }
}
