import { describe, expect, it } from 'vitest';
import {
  keysToEvict,
  LruCache,
  mergeVideoEntry,
  PersistedVideoCache,
  videoStorageKey,
  type KeyValueStore,
} from './cache';

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const lru = new LruCache<string, string>(3);
    lru.set('a', '1');
    lru.set('b', '2');
    lru.set('c', '3');
    expect(lru.get('a')).toBe('1'); // a becomes most recent
    lru.set('d', '4'); // evicts b
    expect(lru.has('b')).toBe(false);
    expect(lru.has('a')).toBe(true);
    expect(lru.has('c')).toBe(true);
    expect(lru.has('d')).toBe(true);
    expect(lru.size).toBe(3);
  });

  it('updating an existing key refreshes it without growing', () => {
    const lru = new LruCache<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('a', 10);
    lru.set('c', 3); // evicts b
    expect(lru.get('a')).toBe(10);
    expect(lru.has('b')).toBe(false);
    expect(lru.size).toBe(2);
  });
});

class MemoryStore implements KeyValueStore {
  data: Record<string, unknown> = {};
  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null) return { ...this.data };
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of list) if (k in this.data) out[k] = this.data[k];
    return out;
  }
  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items);
  }
  async remove(keys: string[]): Promise<void> {
    for (const k of keys) delete this.data[k];
  }
}

describe('persisted video cache', () => {
  it('mergeVideoEntry merges partial results and skips empty translations', () => {
    const first = mergeVideoEntry(undefined, ['a', 'b'], ['A', ''], 1);
    expect(first).toEqual({ ts: 1, map: { a: 'A' } });
    const second = mergeVideoEntry(first, ['b'], ['B'], 2);
    expect(second).toEqual({ ts: 2, map: { a: 'A', b: 'B' } });
  });

  it('keysToEvict keeps the 30 most recent videos and ignores other keys', () => {
    const items: Record<string, unknown> = { settings: { x: 1 }, other: 5 };
    for (let i = 0; i < 35; i++) items[videoStorageKey(`yt:${i}:en`)] = { ts: i, map: {} };
    const evict = keysToEvict(items, 30);
    expect(evict).toHaveLength(5);
    expect(evict.sort()).toEqual([0, 1, 2, 3, 4].map((i) => videoStorageKey(`yt:${i}:en`)).sort());
  });

  it('PersistedVideoCache saves, looks up and evicts beyond 30 videos', async () => {
    const store = new MemoryStore();
    let clock = 0;
    const cache = new PersistedVideoCache(store, 30, () => ++clock);
    for (let i = 0; i < 32; i++) await cache.save(`v${i}`, ['hello'], [`merhaba ${i}`]);
    const videoKeys = Object.keys(store.data).filter((k) => k.startsWith('vc:'));
    expect(videoKeys).toHaveLength(30);
    expect(await cache.lookup('v0')).toEqual({});
    expect(await cache.lookup('v1')).toEqual({});
    expect(await cache.lookup('v31')).toEqual({ hello: 'merhaba 31' });
  });

  it('re-saving an old video refreshes its timestamp so it survives eviction', async () => {
    const store = new MemoryStore();
    let clock = 0;
    const cache = new PersistedVideoCache(store, 2, () => ++clock);
    await cache.save('a', ['x'], ['X']);
    await cache.save('b', ['x'], ['X']);
    await cache.save('a', ['y'], ['Y']);
    await cache.save('c', ['x'], ['X']);
    expect(await cache.lookup('a')).toEqual({ x: 'X', y: 'Y' });
    expect(await cache.lookup('b')).toEqual({});
  });
});
