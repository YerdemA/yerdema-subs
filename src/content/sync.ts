// Drives the overlay from video.currentTime: rAF loop only while playing, one update on
// seeked, binary-search lookup, and a callback only when the active cue (or its translation)
// changes.
import { findActiveCueIndex } from '../shared/cues';
import type { Cue } from '../shared/types';

export type ActiveCueListener = (cue: Cue | undefined) => void;

export interface FrameScheduler {
  request(cb: () => void): number;
  cancel(handle: number): void;
}

const defaultScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
};

export class CueSync {
  private cues: readonly Cue[] = [];
  private frame = 0;
  private running = false;
  private lastKey: string | null = null;
  private readonly onPlay = (): void => this.start();
  private readonly onStop = (): void => {
    this.stop();
    this.update();
  };
  private readonly onSeeked = (): void => this.update();

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly listener: ActiveCueListener,
    private readonly scheduler: FrameScheduler = defaultScheduler,
  ) {
    video.addEventListener('play', this.onPlay);
    video.addEventListener('playing', this.onPlay);
    video.addEventListener('pause', this.onStop);
    video.addEventListener('ended', this.onStop);
    video.addEventListener('seeked', this.onSeeked);
    if (!video.paused && !video.ended) this.start();
    else this.update();
  }

  get isRunning(): boolean {
    return this.running;
  }

  setCues(cues: readonly Cue[]): void {
    this.cues = cues;
    this.refresh();
  }

  /** Forces a re-evaluation (e.g. a translation arrived for the current cue). */
  refresh(): void {
    this.update();
  }

  update(): void {
    const i = findActiveCueIndex(this.cues, this.video.currentTime);
    const cue = i >= 0 ? this.cues[i] : undefined;
    const key = cue ? `${cue.id}|${cue.start}|${cue.text}|${cue.translation ?? ''}` : '';
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.listener(cue);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (): void => {
      if (!this.running) return;
      this.update();
      this.frame = this.scheduler.request(loop);
    };
    loop();
  }

  private stop(): void {
    this.running = false;
    if (this.frame) this.scheduler.cancel(this.frame);
    this.frame = 0;
  }

  destroy(): void {
    this.stop();
    this.video.removeEventListener('play', this.onPlay);
    this.video.removeEventListener('playing', this.onPlay);
    this.video.removeEventListener('pause', this.onStop);
    this.video.removeEventListener('ended', this.onStop);
    this.video.removeEventListener('seeked', this.onSeeked);
  }
}
