// Shared types: data model and typed messages (SPEC §3.1, §3.2).

export interface Cue {
  id: number;
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  /** single-line normalized English text */
  text: string;
  translation?: string;
}

export type Mode = 'tr' | 'tr+en';

export interface Settings {
  enabled: boolean;
  mode: Mode;
  /** px, 14–48 */
  fontSize: number;
  /** % of video height from bottom, 2–40 */
  bottomOffset: number;
  /** 0–1 */
  bgOpacity: number;
  hideOriginal: boolean;
}

export type Status =
  | 'idle'
  | 'no-video'
  | 'no-subtitles'
  | 'translating'
  | 'active'
  | 'error'
  | 'disabled';

export type SubtitleSource = 'youtube-intercept' | 'youtube-dom' | 'html5';

export interface StatusInfo {
  status: Status;
  detail?: string;
  source?: SubtitleSource;
}

// content → background
export interface TranslateRequest {
  type: 'TRANSLATE';
  texts: string[];
  videoKey?: string;
}

export type TranslateResponse =
  | { ok: true; translations: string[] }
  | { ok: false; error: string };

// popup → content
export interface GetStatusRequest {
  type: 'GET_STATUS';
}

export type GetStatusResponse = StatusInfo;

export type RuntimeMessage = TranslateRequest | GetStatusRequest;

// MAIN world ↔ isolated world (window.postMessage)
export const MESSAGE_SOURCE = 'yerdema-subs';

export interface YtCaptionsMessage {
  source: typeof MESSAGE_SOURCE;
  type: 'YT_CAPTIONS';
  videoId: string;
  lang: string;
  /** 'asr' for auto-generated captions, '' otherwise */
  kind: string;
  json: string;
}

/** Isolated world asks MAIN world to replay buffered captions / try enabling captions. */
export interface YtRequestMessage {
  source: typeof MESSAGE_SOURCE;
  type: 'YT_READY' | 'YT_ENABLE_CC';
  videoId: string;
}

/** MAIN world reports the result of trying to enable English captions. */
export interface YtCcResultMessage {
  source: typeof MESSAGE_SOURCE;
  type: 'YT_CC_RESULT';
  videoId: string;
  ok: boolean;
  /** available english tracks detected (manual/asr) */
  detail?: string;
}

export type PageMessage = YtCaptionsMessage | YtRequestMessage | YtCcResultMessage;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPageMessage(value: unknown): value is PageMessage {
  if (!isRecord(value) || value.source !== MESSAGE_SOURCE) return false;
  switch (value.type) {
    case 'YT_CAPTIONS':
      return (
        typeof value.videoId === 'string' &&
        typeof value.lang === 'string' &&
        typeof value.kind === 'string' &&
        typeof value.json === 'string'
      );
    case 'YT_READY':
    case 'YT_ENABLE_CC':
      return typeof value.videoId === 'string';
    case 'YT_CC_RESULT':
      return typeof value.videoId === 'string' && typeof value.ok === 'boolean';
    default:
      return false;
  }
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value)) return false;
  if (value.type === 'GET_STATUS') return true;
  if (value.type === 'TRANSLATE') {
    return (
      Array.isArray(value.texts) &&
      value.texts.every((t) => typeof t === 'string') &&
      (value.videoKey === undefined || typeof value.videoKey === 'string')
    );
  }
  return false;
}
