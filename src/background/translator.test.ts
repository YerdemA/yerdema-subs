import { describe, expect, it } from 'vitest';
import { GoogleGtxTranslator, Limiter, mapWithConcurrency, type FetchFn } from './translator';
import { TranslationService } from './service';
import type { KeyValueStore } from '../shared/cache';

/** Builds a Google-shaped JSON response translating each line to "TR(line)". */
function googleBody(q: string, mutate?: (lines: string[]) => string[]): string {
  let lines = q.split('\n').map((l) => `TR(${l})`);
  if (mutate) lines = mutate(lines);
  // emulate sentence segments that carry the newline at their end
  const segs = lines.map((l, i) => [i < lines.length - 1 ? l + '\n' : l, 'src', null, null, 10]);
  return JSON.stringify([segs, null, 'en']);
}

function qOf(url: string): string {
  return new URL(url).searchParams.get('q') ?? '';
}

function response(status: number, body: string): Response {
  return new Response(body, { status });
}

const noSleep = async (): Promise<void> => {};

describe('GoogleGtxTranslator', () => {
  it('translates and aligns batches in order', async () => {
    const calls: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      calls.push(url);
      return response(200, googleBody(qOf(url)));
    };
    const tr = new GoogleGtxTranslator({ fetchFn, sleep: noSleep });
    const texts = Array.from({ length: 85 }, (_, i) => `line ${i}`);
    const out = await tr.translate(texts, 'tr');
    expect(out).toEqual(texts.map((t) => `TR(${t})`));
    expect(calls).toHaveLength(3); // 40 + 40 + 5
    expect(calls[0]).toContain('client=gtx');
  });

  it('falls back to item-by-item when line counts mismatch', async () => {
    let batchCalls = 0;
    const fetchFn: FetchFn = async (url) => {
      const q = qOf(url);
      if (q.includes('\n')) {
        batchCalls++;
        return response(200, googleBody(q, (lines) => [lines.join(' ')])); // merged lines
      }
      return response(200, googleBody(q));
    };
    const tr = new GoogleGtxTranslator({ fetchFn, sleep: noSleep });
    const out = await tr.translate(['a', 'b', 'c'], 'tr');
    expect(batchCalls).toBe(1);
    expect(out).toEqual(['TR(a)', 'TR(b)', 'TR(c)']);
  });

  it('switches to the fallback endpoint on 429 and remembers it', async () => {
    const hosts: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      const host = new URL(url).host;
      hosts.push(host);
      if (host === 'translate.googleapis.com') return response(429, '<html>Sorry...</html>');
      return response(200, googleBody(qOf(url)));
    };
    const sleeps: number[] = [];
    const tr = new GoogleGtxTranslator({ fetchFn, sleep: async (ms) => void sleeps.push(ms) });
    expect(await tr.translate(['hello'], 'tr')).toEqual(['TR(hello)']);
    expect(await tr.translate(['again'], 'tr')).toEqual(['TR(again)']);
    expect(hosts).toEqual(['translate.googleapis.com', 'clients5.google.com', 'clients5.google.com']);
    expect(sleeps).toEqual([]); // fallback endpoint worked without backoff
  });

  it('retries with exponential backoff 1s/2s/4s then fails', async () => {
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return response(503, 'down');
    };
    const sleeps: number[] = [];
    const tr = new GoogleGtxTranslator({ fetchFn, sleep: async (ms) => void sleeps.push(ms) });
    await expect(tr.translate(['x'], 'tr')).rejects.toThrow('HTTP 503');
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(calls).toBe(4 * 2); // 4 attempts × 2 endpoints
  });

  it('recovers after a transient network error', async () => {
    let calls = 0;
    const fetchFn: FetchFn = async (url) => {
      calls++;
      if (calls <= 2) throw new TypeError('Failed to fetch');
      return response(200, googleBody(qOf(url)));
    };
    const sleeps: number[] = [];
    const tr = new GoogleGtxTranslator({ fetchFn, sleep: async (ms) => void sleeps.push(ms) });
    expect(await tr.translate(['x'], 'tr')).toEqual(['TR(x)']);
    expect(sleeps).toEqual([1000]);
  });

  it('does not retry non-retryable 4xx errors', async () => {
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return response(400, 'bad');
    };
    const tr = new GoogleGtxTranslator({ fetchFn, sleep: noSleep });
    await expect(tr.translate(['x'], 'tr')).rejects.toThrow('HTTP 400');
    expect(calls).toBe(1);
  });

  it('runs at most 2 batch requests concurrently', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFn: FetchFn = async (url) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return response(200, googleBody(qOf(url)));
    };
    const tr = new GoogleGtxTranslator({ fetchFn, sleep: noSleep });
    const texts = Array.from({ length: 200 }, (_, i) => `t${i}`);
    await Promise.all([tr.translate(texts, 'tr'), tr.translate(texts.slice(0, 50), 'tr')]);
    expect(maxInFlight).toBe(2);
  });
});

describe('Limiter / mapWithConcurrency', () => {
  it('limits concurrency and preserves order', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });

  it('releases slots when a task throws', async () => {
    const limiter = new Limiter(1);
    await expect(limiter.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await limiter.run(async () => 42)).toBe(42);
    expect(limiter.running).toBe(0);
  });
});

class MemoryStore implements KeyValueStore {
  data: Record<string, unknown> = {};
  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null) return { ...this.data };
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter((k) => k in this.data).map((k) => [k, this.data[k]]));
  }
  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items);
  }
  async remove(keys: string[]): Promise<void> {
    keys.forEach((k) => delete this.data[k]);
  }
}

describe('TranslationService', () => {
  it('uses the memory cache, dedupes and skips empty texts', async () => {
    const seen: string[][] = [];
    const translator = {
      translate: async (texts: string[]) => {
        seen.push(texts);
        return texts.map((t) => `TR(${t})`);
      },
    };
    const svc = new TranslationService(translator, null);
    expect(await svc.handle(['a', 'b', 'a', ''])).toEqual({ ok: true, translations: ['TR(a)', 'TR(b)', 'TR(a)', ''] });
    expect(await svc.handle(['a', 'c'])).toEqual({ ok: true, translations: ['TR(a)', 'TR(c)'] });
    expect(seen).toEqual([['a', 'b'], ['c']]);
  });

  it('persists per video and serves from storage after a restart', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const translator = {
      translate: async (texts: string[]) => {
        calls++;
        return texts.map((t) => `TR(${t})`);
      },
    };
    await new TranslationService(translator, store).handle(['x', 'y'], 'yt:abc:en');
    // new service = service worker restarted, empty memory cache
    const res = await new TranslationService(translator, store).handle(['y', 'x'], 'yt:abc:en');
    expect(res).toEqual({ ok: true, translations: ['TR(y)', 'TR(x)'] });
    expect(calls).toBe(1);
  });

  it('never throws, returns ok:false on errors', async () => {
    const svc = new TranslationService({ translate: async () => Promise.reject(new Error('boom')) }, null);
    expect(await svc.handle(['a'])).toEqual({ ok: false, error: 'boom' });
  });
});
