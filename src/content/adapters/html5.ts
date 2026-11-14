// Generic HTML5 adapter: reads native <video>.textTracks cues (SPEC §5.2).
import { cleanCueText, sortCues } from '../../shared/cues';
import { hashString } from '../../shared/cache';
import type { Cue, CurrentSubtitle, Settings, StatusInfo } from '../../shared/types';
import { CueSession } from '../cue-session';
import { Overlay } from '../overlay';
import { Detail, type Adapter } from './types';

interface TrackLike {
  kind: string;
  language: string;
}

interface CueLike {
  startTime: number;
  endTime: number;
  text?: unknown;
}

/** Picks a subtitles/captions track, preferring English, otherwise the first one. */
export function chooseTrack<T extends TrackLike>(tracks: ArrayLike<T>): T | undefined {
  const list = Array.from(tracks).filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
  return list.find((t) => t.language.toLowerCase().startsWith('en')) ?? list[0];
}

/** Converts TextTrack cues to our Cue model: tags stripped, whitespace normalized, sorted. */
export function textTrackCuesToCues(cues: ArrayLike<CueLike>): Cue[] {
  const out: Cue[] = [];
  for (const c of Array.from(cues)) {
    if (typeof c.text !== 'string') continue;
    const text = cleanCueText(c.text);
    if (!text || !Number.isFinite(c.startTime)) continue;
    const end = Number.isFinite(c.endTime) ? c.endTime : c.startTime + 5;
    out.push({ id: out.length, start: c.startTime, end: Math.max(c.startTime, end), text });
  }
  return sortCues(out);
}

/** Largest visible video that is playing or has been played. */
export function pickVideo(videos: ArrayLike<HTMLVideoElement>): HTMLVideoElement | undefined {
  let best: HTMLVideoElement | undefined;
  let bestArea = 0;
  for (const v of Array.from(videos)) {
    const started = !v.paused || v.played.length > 0 || v.currentTime > 0;
    if (!started) continue;
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      best = v;
      bestArea = area;
    }
  }
  return best;
}

const CUE_POLL_MS = 250;
const CUE_TIMEOUT_MS = 5000;

/** Handles one chosen <video>. */
class VideoBinding {
  private track: TextTrack | undefined;
  private trackEl: HTMLTrackElement | undefined;
  private previousMode: TextTrackMode | undefined;
  private session: CueSession | null = null;
  private readonly overlay: Overlay;
  private status: StatusInfo = { status: 'idle', detail: Detail.loading, source: 'html5' };
  private pollTimer = 0;
  private lastCueCount = -1;
  private readonly onAddTrack = (): void => this.selectTrack();
  private readonly onCueChange = (): void => this.readCues();
  private readonly onTrackLoad = (): void => this.readCues();
  private readonly onTrackError = (): void => {
    if (!this.track?.cues || this.track.cues.length === 0) {
      this.status = { status: 'no-subtitles', detail: Detail.cors, source: 'html5' };
    }
  };

  constructor(
    readonly video: HTMLVideoElement,
    private settings: Settings,
  ) {
    this.overlay = new Overlay(settings, video.ownerDocument);
    this.overlay.mountOver(video);
    video.textTracks.addEventListener('addtrack', this.onAddTrack);
    this.selectTrack();
  }

  getStatus(): StatusInfo {
    if (!this.session) return this.status;
    const status = this.session.status;
    return {
      status,
      source: 'html5',
      ...(status === 'error' ? { detail: Detail.translateFailed } : {}),
    };
  }

  getCurrent(): CurrentSubtitle | null {
    return this.overlay.current;
  }

  setSettings(settings: Settings): void {
    const hideChanged = settings.hideOriginal !== this.settings.hideOriginal;
    this.settings = settings;
    this.overlay.setSettings(settings);
    if (hideChanged && this.track) this.track.mode = settings.hideOriginal ? 'hidden' : 'showing';
  }

  private selectTrack(): void {
    const track = chooseTrack(this.video.textTracks);
    if (!track) {
      this.status = { status: 'no-subtitles', detail: Detail.noTrack, source: 'html5' };
      return;
    }
    if (track === this.track) return;
    this.releaseTrack();
    this.track = track;
    this.previousMode = track.mode;
    track.mode = this.settings.hideOriginal ? 'hidden' : 'showing';
    track.addEventListener('cuechange', this.onCueChange);
    this.trackEl = Array.from(this.video.querySelectorAll('track')).find((el) => el.track === track);
    this.trackEl?.addEventListener('load', this.onTrackLoad);
    this.trackEl?.addEventListener('error', this.onTrackError);
    this.status = { status: 'idle', detail: Detail.loading, source: 'html5' };
    this.lastCueCount = -1;

    const startedAt = Date.now();
    window.clearInterval(this.pollTimer);
    this.pollTimer = window.setInterval(() => {
      this.readCues();
      const cues = this.track?.cues;
      if (cues && cues.length > 0) {
        window.clearInterval(this.pollTimer);
      } else if (Date.now() - startedAt > CUE_TIMEOUT_MS) {
        window.clearInterval(this.pollTimer);
        if (!this.session) {
          this.status = {
            status: 'no-subtitles',
            detail: cues === null ? Detail.cors : Detail.noTrack,
            source: 'html5',
          };
        }
      }
    }, CUE_POLL_MS);
    this.readCues();
  }

  private readCues(): void {
    const track = this.track;
    if (!track) return;
    const list = track.cues;
    if (!list || list.length === 0 || list.length === this.lastCueCount) return;
    this.lastCueCount = list.length;
    const cues = textTrackCuesToCues(list as unknown as ArrayLike<CueLike>);
    if (cues.length === 0) return;
    if (!this.session) {
      const key = `h5:${hashString(`${location.origin}${location.pathname}|${this.video.currentSrc}|${track.language}|${track.label}`)}`;
      this.session = new CueSession(this.video, this.overlay, key);
    }
    this.session.setCues(cues);
  }

  private releaseTrack(): void {
    const track = this.track;
    if (!track) return;
    track.removeEventListener('cuechange', this.onCueChange);
    this.trackEl?.removeEventListener('load', this.onTrackLoad);
    this.trackEl?.removeEventListener('error', this.onTrackError);
    if (this.previousMode !== undefined) {
      try {
        track.mode = this.previousMode;
      } catch {
        // ignore
      }
    }
    this.session?.destroy();
    this.session = null;
    this.track = undefined;
    this.trackEl = undefined;
  }

  destroy(): void {
    window.clearInterval(this.pollTimer);
    this.video.textTracks.removeEventListener('addtrack', this.onAddTrack);
    this.releaseTrack();
    this.overlay.destroy();
  }
}

export class Html5Adapter implements Adapter {
  private binding: VideoBinding | null = null;
  private observer: MutationObserver | null = null;
  private scanTimer = 0;
  private readonly videos: HTMLCollectionOf<HTMLVideoElement>;
  private readonly onMediaEvent = (e: Event): void => {
    if (e.target instanceof HTMLVideoElement) this.scheduleScan(0);
  };

  constructor(
    private settings: Settings,
    private readonly doc: Document = document,
  ) {
    this.videos = doc.getElementsByTagName('video');
    // Media events don't bubble, but they can be captured at the document.
    doc.addEventListener('play', this.onMediaEvent, true);
    doc.addEventListener('playing', this.onMediaEvent, true);
    this.observer = new MutationObserver(() => this.scheduleScan(500));
    this.observer.observe(doc.documentElement, { childList: true, subtree: true });
    this.scan();
  }

  /** True when this frame has at least one <video> (used to decide who answers GET_STATUS). */
  get hasVideo(): boolean {
    return this.videos.length > 0;
  }

  getStatus(): StatusInfo {
    if (this.binding) return this.binding.getStatus();
    if (this.videos.length === 0) return { status: 'no-video' };
    return { status: 'idle', detail: Detail.notPlaying, source: 'html5' };
  }

  getCurrent(): CurrentSubtitle | null {
    return this.binding?.getCurrent() ?? null;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.binding?.setSettings(settings);
  }

  private scheduleScan(delay: number): void {
    if (this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = 0;
      this.scan();
    }, delay);
  }

  private scan(): void {
    const current = this.binding?.video;
    if (current && !current.isConnected) {
      this.binding?.destroy();
      this.binding = null;
    }
    const best = pickVideo(this.videos);
    if (!best || best === this.binding?.video) return;
    // Keep the current video while it is still playing; switch otherwise.
    if (this.binding && !this.binding.video.paused) return;
    this.binding?.destroy();
    this.binding = new VideoBinding(best, this.settings);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    window.clearTimeout(this.scanTimer);
    this.doc.removeEventListener('play', this.onMediaEvent, true);
    this.doc.removeEventListener('playing', this.onMediaEvent, true);
    this.binding?.destroy();
    this.binding = null;
  }
}
