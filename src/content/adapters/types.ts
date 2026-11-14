import type { CurrentSubtitle, Settings, StatusInfo } from '../../shared/types';

/** A subtitle source adapter owns everything on the page while subtitles are enabled. */
export interface Adapter {
  getStatus(): StatusInfo;
  /** Subtitle currently on screen (copy button). */
  getCurrent(): CurrentSubtitle | null;
  setSettings(settings: Settings): void;
  destroy(): void;
}

/** Status detail codes; the popup maps them to localized hints (`detail_<code>`). */
export const Detail = {
  turnOnCC: 'turnOnCC',
  noTrack: 'noTrack',
  cors: 'cors',
  loading: 'loading',
  notPlaying: 'notPlaying',
  ad: 'ad',
  translateFailed: 'translateFailed',
  siteDisabled: 'siteDisabled',
} as const;
