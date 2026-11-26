// Ties together a <video>, a cue list, the overlay, the sync loop and the translator.
// Used by both the YouTube intercept mode and the generic HTML5 adapter.
import { cueTime } from '../shared/delay';
import type { Cue, Status } from '../shared/types';
import { CueSync, type FrameScheduler } from './sync';
import { CueTranslator, sendTranslateMessage, type SendTranslate } from './cue-translator';
import type { Overlay } from './overlay';

export class CueSession {
  private readonly sync: CueSync;
  private readonly translator: CueTranslator;
  private readonly onSeeked = (): void => this.translator.reprioritize();

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly overlay: Overlay,
    videoKey?: string,
    send: SendTranslate = sendTranslateMessage,
    scheduler?: FrameScheduler,
    private readonly onChange?: () => void,
    delaySec = 0,
  ) {
    this.sync = new CueSync(
      video,
      (cue) => this.overlay.show(cue ? { original: cue.text, translation: cue.translation } : null),
      scheduler,
    );
    this.sync.setDelay(delaySec);
    this.translator = new CueTranslator(
      send,
      () => cueTime(this.video.currentTime, this.sync.delay),
      () => {
        this.sync.refresh();
        this.onChange?.();
      },
      videoKey,
    );
    video.addEventListener('seeked', this.onSeeked);
  }

  setCues(cues: Cue[]): void {
    this.sync.setCues(cues);
    this.translator.setCues(cues);
    this.onChange?.();
  }

  get delay(): number {
    return this.sync.delay;
  }

  setDelay(sec: number): void {
    this.sync.setDelay(sec);
    this.translator.reprioritize();
  }

  retryFailed(): void {
    this.translator.retryFailed();
  }

  get status(): Status {
    switch (this.translator.state) {
      case 'translating':
        return 'translating';
      case 'error':
        return 'error';
      case 'done':
        return 'active';
      default:
        return 'no-subtitles';
    }
  }

  get lastError(): string | undefined {
    return this.translator.lastError;
  }

  destroy(): void {
    this.video.removeEventListener('seeked', this.onSeeked);
    this.sync.destroy();
    this.translator.destroy();
    this.overlay.show(null);
  }
}
