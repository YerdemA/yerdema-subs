// Settings: defaults, clamping, load/save/subscribe over chrome.storage.sync.
import { isRecord, type Mode, type Settings } from './types';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  enabled: true,
  mode: 'tr',
  fontSize: 24,
  bottomOffset: 10,
  bgOpacity: 0.6,
  hideOriginal: true,
  disabledSites: Object.freeze([]) as unknown as string[],
});

export const MAX_DISABLED_SITES = 500;

export const LIMITS = {
  fontSize: { min: 14, max: 48 },
  bottomOffset: { min: 2, max: 85 },
  bgOpacity: { min: 0, max: 1 },
} as const;

const STORAGE_KEY = 'settings';

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const v of value) {
    if (typeof v === 'string' && v.trim()) out.add(v.trim().toLowerCase());
  }
  return [...out].slice(0, MAX_DISABLED_SITES);
}

/** True when the extension is switched off for the given host (exact hostname match). */
export function isSiteDisabled(settings: Settings, host: string): boolean {
  return settings.disabledSites.includes(host.toLowerCase());
}

/** Returns a new site list with the host added (disabled=true) or removed. */
export function withSite(list: readonly string[], host: string, disabled: boolean): string[] {
  const h = host.toLowerCase();
  const rest = list.filter((x) => x !== h);
  return disabled ? [...rest, h] : rest;
}

/** Coerces any stored/partial value into a complete, valid Settings object. */
export function normalizeSettings(raw: unknown): Settings {
  const r = isRecord(raw) ? raw : {};
  const mode: Mode = r.mode === 'tr+en' || r.mode === 'tr' ? r.mode : DEFAULT_SETTINGS.mode;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_SETTINGS.enabled,
    mode,
    fontSize: Math.round(
      clampNumber(r.fontSize, LIMITS.fontSize.min, LIMITS.fontSize.max, DEFAULT_SETTINGS.fontSize),
    ),
    bottomOffset: clampNumber(
      r.bottomOffset,
      LIMITS.bottomOffset.min,
      LIMITS.bottomOffset.max,
      DEFAULT_SETTINGS.bottomOffset,
    ),
    bgOpacity: clampNumber(
      r.bgOpacity,
      LIMITS.bgOpacity.min,
      LIMITS.bgOpacity.max,
      DEFAULT_SETTINGS.bgOpacity,
    ),
    hideOriginal:
      typeof r.hideOriginal === 'boolean' ? r.hideOriginal : DEFAULT_SETTINGS.hideOriginal,
    disabledSites: normalizeSites(r.disabledSites),
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    return normalizeSettings(data[STORAGE_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

/** Calls `listener` with the new settings whenever they change. Returns an unsubscribe fn. */
export function subscribeSettings(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'sync' || !(STORAGE_KEY in changes)) return;
    listener(normalizeSettings(changes[STORAGE_KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
