// Pure YouTube helpers (URL parsing, caption track choice, payload ranking).
import { isRecord } from './types';

/** videoId for /watch?v=… pages; null elsewhere (Shorts are out of scope). */
export function getWatchVideoId(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.pathname !== '/watch') return null;
    const v = url.searchParams.get('v');
    return v && /^[\w-]{6,20}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export interface TimedtextParams {
  videoId: string;
  lang: string;
  kind: string;
  /** set when YouTube auto-translates the track (we skip those) */
  tlang: string;
}

export function parseTimedtextUrl(rawUrl: string, base = 'https://www.youtube.com/'): TimedtextParams | null {
  try {
    const url = new URL(rawUrl, base);
    if (!url.pathname.includes('/api/timedtext')) return null;
    const p = url.searchParams;
    return {
      videoId: p.get('v') ?? '',
      lang: p.get('lang') ?? '',
      kind: p.get('kind') ?? '',
      tlang: p.get('tlang') ?? '',
    };
  } catch {
    return null;
  }
}

export function isEnglish(lang: string): boolean {
  return /^en(\b|[-_])/i.test(lang) || lang.toLowerCase() === 'en';
}

/** Lower is better: manual EN < ASR EN < other manual < other ASR. */
export function payloadRank(lang: string, kind: string): number {
  const asr = kind === 'asr' ? 1 : 0;
  return (isEnglish(lang) ? 0 : 2) + asr;
}

export interface PlayerTrack {
  languageCode: string;
  kind?: string;
  vss_id?: string;
  [key: string]: unknown;
}

export function toPlayerTracks(list: unknown): PlayerTrack[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (t): t is PlayerTrack => isRecord(t) && typeof t.languageCode === 'string',
  );
}

/** Prefers a manual English track over an ASR English track. */
export function pickBestTrack(tracks: readonly PlayerTrack[]): PlayerTrack | undefined {
  const en = tracks.filter((t) => isEnglish(t.languageCode));
  return en.find((t) => t.kind !== 'asr') ?? en[0];
}

export function sameTrack(a: unknown, b: PlayerTrack): boolean {
  if (!isRecord(a) || typeof a.languageCode !== 'string') return false;
  if (a.languageCode !== b.languageCode) return false;
  const ak = a.kind === 'asr' ? 'asr' : '';
  const bk = b.kind === 'asr' ? 'asr' : '';
  return ak === bk;
}
