// In-memory LRU + persisted per-video translation cache helpers.

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // refresh recency
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  clear(): void {
    this.map.clear();
  }
}

export const MEMORY_CACHE_MAX = 5000;
export const PERSISTED_VIDEOS_MAX = 30;
export const VIDEO_CACHE_PREFIX = 'vc:';

/**
 * Persisted per-video entry. Stored as a text→translation map (not a positional array) so it
 * stays valid even if the cue list for the same video changes (e.g. ASR vs manual track,
 * different merge results) and partial, priority-ordered results can be merged in.
 */
export interface VideoCacheEntry {
  ts: number;
  map: Record<string, string>;
}

export function isVideoCacheEntry(value: unknown): value is VideoCacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.ts === 'number' && typeof v.map === 'object' && v.map !== null;
}

export function videoStorageKey(videoKey: string): string {
  return VIDEO_CACHE_PREFIX + videoKey;
}

/** Merges new translations into an existing entry (or creates one). */
export function mergeVideoEntry(
  existing: VideoCacheEntry | undefined,
  texts: readonly string[],
  translations: readonly string[],
  now: number,
): VideoCacheEntry {
  const map: Record<string, string> = { ...(existing?.map ?? {}) };
  texts.forEach((text, i) => {
    const tr = translations[i];
    if (typeof tr === 'string' && tr.length > 0) map[text] = tr;
  });
  return { ts: now, map };
}

/**
 * Given all stored items, returns the storage keys of video entries to delete so that only the
 * `max` most recent (by ts) remain.
 */
export function keysToEvict(
  items: Record<string, unknown>,
  max = PERSISTED_VIDEOS_MAX,
): string[] {
  const entries: Array<{ key: string; ts: number }> = [];
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(VIDEO_CACHE_PREFIX)) continue;
    entries.push({ key, ts: isVideoCacheEntry(value) ? value.ts : 0 });
  }
  if (entries.length <= max) return [];
  entries.sort((a, b) => b.ts - a.ts);
  return entries.slice(max).map((e) => e.key);
}

/** Minimal async key/value interface over chrome.storage.local (injectable for tests). */
export interface KeyValueStore {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export class PersistedVideoCache {
  constructor(
    private readonly store: KeyValueStore,
    private readonly max = PERSISTED_VIDEOS_MAX,
    private readonly now: () => number = Date.now,
  ) {}

  async lookup(videoKey: string): Promise<Record<string, string>> {
    try {
      const key = videoStorageKey(videoKey);
      const data = await this.store.get(key);
      const entry = data[key];
      return isVideoCacheEntry(entry) ? entry.map : {};
    } catch {
      return {};
    }
  }

  async save(videoKey: string, texts: readonly string[], translations: readonly string[]): Promise<void> {
    const key = videoStorageKey(videoKey);
    const data = await this.store.get(key);
    const existing = data[key];
    const entry = mergeVideoEntry(
      isVideoCacheEntry(existing) ? existing : undefined,
      texts,
      translations,
      this.now(),
    );
    await this.store.set({ [key]: entry });
    const all = await this.store.get(null);
    const evict = keysToEvict(all, this.max);
    if (evict.length > 0) await this.store.remove(evict);
  }
}

/** FNV-1a 32-bit hash → base36 string (short, stable cache keys). */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
