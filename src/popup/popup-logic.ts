// Pure popup helpers (unit-tested).
import type { CurrentSubtitle, Status, SubtitleSource } from '../shared/types';

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
