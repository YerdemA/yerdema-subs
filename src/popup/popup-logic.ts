// Pure popup helpers (unit-tested).
import type { LiveState } from '../shared/live';
import type { CurrentSubtitle, Status, SubtitleSource } from '../shared/types';

export interface LiveView {
  /** button label key */
  button: 'liveStart' | 'liveStop';
  on: boolean;
  /** status line: i18n key + substitution, or null for none */
  status: { key: string; arg?: string } | null;
}

/** What the popup's live section shows for the background's live state and the active tab. */
export function liveView(state: LiveState | null, activeTabId: number | undefined): LiveView {
  const phase = state?.phase ?? 'off';
  const running = phase === 'starting' || phase === 'loading' || phase === 'listening';
  if (running && state?.tabId !== undefined && state.tabId !== activeTabId) {
    return { button: 'liveStop', on: true, status: { key: 'liveOtherTab' } };
  }
  switch (phase) {
    case 'starting':
      return { button: 'liveStop', on: true, status: { key: 'liveStarting' } };
    case 'loading':
      return {
        button: 'liveStop',
        on: true,
        status: { key: 'liveLoading', arg: String(Math.round((state?.progress ?? 0) * 100)) },
      };
    case 'listening':
      return {
        button: 'liveStop',
        on: true,
        status: { key: 'liveListening', arg: state?.device === 'wasm' ? 'CPU' : 'GPU' },
      };
    case 'error':
      return { button: 'liveStart', on: false, status: { key: 'liveError', arg: state?.error ?? '' } };
    default:
      return { button: 'liveStart', on: false, status: null };
  }
}

/** The preview box is smaller than a real video; scale fonts down. */
export const PREVIEW_SCALE = 0.6;

const KNOWN_DETAILS = new Set([
  'turnOnCC',
  'noTrack',
  'cors',
  'loading',
  'notPlaying',
  'ad',
  'translateFailed',
  'siteDisabled',
]);

/** Clipboard text for the copy button: Turkish line, then English line. */
export function formatCopyText(current: CurrentSubtitle | undefined): string {
  if (!current) return '';
  return [current.translation?.trim(), current.original.trim()].filter((x) => x).join('\n');
}

/** i18n key for a status; undefined status = no content script answered. */
export function statusMessageKey(status: Status | undefined): string {
  if (!status) return 'status_unsupported';
  return `status_${status.replace(/-/g, '_')}`;
}

export function detailMessageKey(detail: string | undefined): string | null {
  return detail && KNOWN_DETAILS.has(detail) ? `detail_${detail}` : null;
}

export function sourceMessageKey(source: SubtitleSource | undefined): string | null {
  return source ? `source_${source.replace(/-/g, '_')}` : null;
}
