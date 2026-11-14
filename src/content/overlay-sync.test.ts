// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Overlay } from './overlay';
import { CueSync, type FrameScheduler } from './sync';
import { CueTranslator } from './cue-translator';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { Cue, Settings } from '../shared/types';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('Overlay', () => {
  it('renders TR only by default and TR+EN in tr+en mode', () => {
    const o = new Overlay(settings());
    o.show({ original: 'Hello', translation: 'Merhaba' });
    expect(o.displayedText).toBe('Merhaba');
    o.setSettings(settings({ mode: 'tr+en' }));
    expect(o.displayedText).toBe('Merhaba\nHello');
  });

  it('shows the English text dimmed/italic while the translation is pending', () => {
    const o = new Overlay(settings({ mode: 'tr+en' }));
    o.show({ original: 'Hello' });
    expect(o.displayedText).toBe('Hello');
    expect(o.shadow.querySelector('.tr')?.classList.contains('pending')).toBe(true);
    o.show({ original: 'Hello', translation: 'Merhaba' });
    expect(o.shadow.querySelector('.tr')?.classList.contains('pending')).toBe(false);
  });

  it('hides when disabled, invisible or cleared', () => {
    const o = new Overlay(settings());
    o.show({ original: 'Hello', translation: 'Merhaba' });
    o.setVisible(false);
    expect(o.displayedText).toBe('');
    o.setVisible(true);
    expect(o.displayedText).toBe('Merhaba');
    o.setSettings(settings({ enabled: false }));
    expect(o.displayedText).toBe('');
    o.setSettings(settings());
    o.show(null);
    expect(o.displayedText).toBe('');
  });

  it('applies settings as CSS variables live', () => {
    const o = new Overlay(settings());
    o.setSettings(settings({ fontSize: 30, bottomOffset: 20, bgOpacity: 0.3 }));
    expect(o.host.style.getPropertyValue('--ys-fs')).toBe('30px');
    expect(o.host.style.getPropertyValue('--ys-bottom')).toBe('20%');
    expect(o.host.style.getPropertyValue('--ys-bg')).toBe('0.3');
  });

  it('does not touch the DOM when the same content is shown again', () => {
    const o = new Overlay(settings());
    o.show({ original: 'Hello', translation: 'Merhaba' });
    const tr = o.shadow.querySelector('.tr')!;
    const spy = vi.fn();
    const mo = new MutationObserver(spy);
    mo.observe(tr, { childList: true, characterData: true, subtree: true });
    o.show({ original: 'Hello', translation: 'Merhaba' });
    expect(mo.takeRecords()).toHaveLength(0);
    mo.disconnect();
  });

  it('mounts inside a container and over a video', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const o = new Overlay(settings());
    o.mountInside(container);
    expect(o.host.parentElement).toBe(container);
    const video = document.createElement('video');
    document.body.append(video);
    o.mountOver(video);
    expect(container.contains(o.host)).toBe(false);
    expect(o.host.parentElement).toBe(document.body);
    expect(o.host.style.position).toBe('fixed');
    o.destroy();
    expect(o.host.isConnected).toBe(false);
  });
});

class FakeVideo extends EventTarget {
  currentTime = 0;
  paused = true;
  ended = false;
  play(): void {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  }
  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  seek(t: number): void {
    this.currentTime = t;
    this.dispatchEvent(new Event('seeked'));
  }
}

function manualScheduler(): FrameScheduler & { tick(): void; pending: number } {
  let cbs: Array<() => void> = [];
  return {
    request(cb) {
      cbs.push(cb);
      return cbs.length;
    },
    cancel() {
      cbs = [];
    },
    tick() {
      const run = cbs;
      cbs = [];
      run.forEach((cb) => cb());
    },
    get pending() {
      return cbs.length;
    },
  };
}

const cues = (): Cue[] => [
  { id: 0, start: 1, end: 2, text: 'one' },
  { id: 1, start: 3, end: 4, text: 'two' },
];

describe('CueSync', () => {
  it('runs the rAF loop only while playing and notifies only on change', () => {
    const video = new FakeVideo();
    const sched = manualScheduler();
    const seen: Array<string | undefined> = [];
    const sync = new CueSync(video as unknown as HTMLVideoElement, (c) => seen.push(c?.text), sched);
    sync.setCues(cues());
    expect(sync.isRunning).toBe(false);
    expect(sched.pending).toBe(0);

    video.play();
    expect(sync.isRunning).toBe(true);
    video.currentTime = 1.5;
    sched.tick();
    sched.tick();
    sched.tick();
    video.currentTime = 2.5;
    sched.tick();
    video.currentTime = 3.2;
    sched.tick();
    expect(seen).toEqual([undefined, 'one', undefined, 'two']);

    video.pause();
    expect(sync.isRunning).toBe(false);
    expect(sched.pending).toBe(0);
  });

  it('updates once on seeked while paused', () => {
    const video = new FakeVideo();
    const sched = manualScheduler();
    const seen: Array<string | undefined> = [];
    const sync = new CueSync(video as unknown as HTMLVideoElement, (c) => seen.push(c?.text), sched);
    sync.setCues(cues());
    video.seek(3.5);
    expect(seen).toEqual([undefined, 'two']);
    expect(sched.pending).toBe(0);
  });

  it('refresh re-notifies when a translation arrives for the active cue', () => {
    const video = new FakeVideo();
    const list = cues();
    const seen: Array<string | undefined> = [];
    const sync = new CueSync(video as unknown as HTMLVideoElement, (c) => seen.push(c?.translation), manualScheduler());
    video.currentTime = 1.5;
    sync.setCues(list);
    list[0]!.translation = 'bir';
    sync.refresh();
    expect(seen).toEqual([undefined, undefined, 'bir']);
  });
});

describe('CueTranslator', () => {
  it('translates in priority order with at most 2 requests in flight', async () => {
    const list: Cue[] = Array.from({ length: 200 }, (_, i) => ({ id: i, start: i * 2, end: i * 2 + 1.5, text: `cue ${i}` }));
    const requests: string[][] = [];
    let inFlight = 0;
    let peak = 0;
    const send = async (texts: string[]) => {
      requests.push(texts);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { ok: true as const, translations: texts.map((t) => `TR ${t}`) };
    };
    const tr = new CueTranslator(send, () => 200, () => {});
    tr.setCues(list);
    expect(tr.state).toBe('translating');
    await vi.waitFor(() => expect(tr.state).toBe('done'));
    expect(peak).toBe(2);
    // first request starts around t=200s (cue 97 ends at 195.5 ≥ 195)
    expect(requests[0]![0]).toBe('cue 97');
    requests.forEach((r) => expect(r.length).toBeLessThanOrEqual(40));
    expect(list.every((c) => c.translation === `TR ${c.text}`)).toBe(true);
  });

  it('marks failures as error, keeps English, and can retry', async () => {
    const list: Cue[] = [{ id: 0, start: 0, end: 1, text: 'a' }];
    let fail = true;
    const send = async (texts: string[]) =>
      fail ? { ok: false as const, error: 'HTTP 429' } : { ok: true as const, translations: texts.map((t) => t.toUpperCase()) };
    const tr = new CueTranslator(send, () => 0, () => {});
    tr.setCues(list);
    await vi.waitFor(() => expect(tr.state).toBe('error'));
    expect(tr.lastError).toBe('HTTP 429');
    expect(list[0]!.translation).toBeUndefined();
    fail = false;
    tr.retryFailed();
    await vi.waitFor(() => expect(tr.state).toBe('done'));
    expect(list[0]!.translation).toBe('A');
  });

  it('auto-retries failures with growing delays and gives up after 5 retries', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const send = async () => {
      calls++;
      return { ok: false as const, error: 'HTTP 429' };
    };
    const tr = new CueTranslator(send, () => 0, () => {});
    tr.setCues([{ id: 0, start: 0, end: 1, text: 'a' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(19999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2); // +20 s
    await vi.advanceTimersByTimeAsync(40000);
    expect(calls).toBe(3); // +40 s
    await vi.advanceTimersByTimeAsync(80000 + 160000 + 300000);
    expect(calls).toBe(6);
    await vi.advanceTimersByTimeAsync(3600000);
    expect(calls).toBe(6); // gave up
    tr.destroy();
    vi.useRealTimers();
  });

  it('dedupes identical texts and reuses known translations for new cue lists', async () => {
    const sent: string[] = [];
    const send = async (texts: string[]) => {
      sent.push(...texts);
      return { ok: true as const, translations: texts.map((t) => `<${t}>`) };
    };
    const tr = new CueTranslator(send, () => 0, () => {});
    tr.setCues([
      { id: 0, start: 0, end: 1, text: 'x' },
      { id: 1, start: 1, end: 2, text: 'x' },
    ]);
    await vi.waitFor(() => expect(tr.state).toBe('done'));
    const next: Cue[] = [
      { id: 0, start: 0, end: 1, text: 'x' },
      { id: 1, start: 1, end: 2, text: 'y' },
    ];
    tr.setCues(next);
    await vi.waitFor(() => expect(tr.state).toBe('done'));
    expect(sent).toEqual(['x', 'y']);
    expect(next.map((c) => c.translation)).toEqual(['<x>', '<y>']);
  });
});
