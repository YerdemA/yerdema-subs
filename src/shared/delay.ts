// Subtitle delay (sync offset), per video. Positive = subtitles appear later.

export const DELAY_LIMIT_SEC = 10;
export const DELAY_STEP_SEC = 0.5;

/** Clamps to ±DELAY_LIMIT_SEC and rounds to 0.1 s (avoids float drift from repeated steps). */
export function clampDelay(sec: number): number {
  if (!Number.isFinite(sec)) return 0;
  const r = Math.round(sec * 10) / 10;
  return Math.min(DELAY_LIMIT_SEC, Math.max(-DELAY_LIMIT_SEC, r)) || 0;
}

/** Media time used to look up the active cue for a given delay. */
export function cueTime(currentTime: number, delaySec: number): number {
  return currentTime - delaySec;
}

/** Popup label, e.g. "+1.5 s", "−0.5 s", "0 s". */
export function formatDelay(sec: number, unit = 's'): string {
  const d = clampDelay(sec);
  if (d === 0) return `0 ${unit}`;
  const abs = Math.abs(d).toFixed(1).replace(/\.0$/, '');
  return `${d > 0 ? '+' : '−'}${abs} ${unit}`;
}
