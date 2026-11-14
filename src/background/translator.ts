// Translation providers. Adding a provider (e.g. DeepL) = one new file implementing Translator.
import { makeBatches, type Batch } from '../shared/batching';
import {
  alignTranslations,
  buildGoogleUrl,
  GOOGLE_ENDPOINTS,
  parseGoogleBody,
  type GoogleEndpoint,
} from '../shared/google';

export type TargetLang = 'tr';

export interface Translator {
  translate(texts: string[], target: TargetLang): Promise<string[]>;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number) => Promise<void>;

export const BACKOFF_MS = [1000, 2000, 4000] as const;
export const MAX_CONCURRENT_BATCHES = 2;
export const ITEM_FALLBACK_CONCURRENCY = 3;

/** Error that should be retried with backoff (429, 5xx, network, unparseable body). */
export class RetryableError extends Error {}

/** Simple counting semaphore. */
export class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get running(): number {
    return this.active;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** Runs `fn` over items with at most `concurrency` in flight; preserves order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface GoogleGtxOptions {
  fetchFn?: FetchFn;
  sleep?: SleepFn;
  endpoints?: readonly GoogleEndpoint[];
  maxConcurrentBatches?: number;
}

export class GoogleGtxTranslator implements Translator {
  private readonly fetchFn: FetchFn;
  private readonly sleep: SleepFn;
  private readonly endpoints: readonly GoogleEndpoint[];
  private readonly limiter: Limiter;
  /** index of the endpoint that last worked; tried first */
  private preferred = 0;

  constructor(opts: GoogleGtxOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.sleep = opts.sleep ?? defaultSleep;
    this.endpoints = opts.endpoints ?? GOOGLE_ENDPOINTS;
    this.limiter = new Limiter(opts.maxConcurrentBatches ?? MAX_CONCURRENT_BATCHES);
  }

  async translate(texts: string[], target: TargetLang): Promise<string[]> {
    if (texts.length === 0) return [];
    const batches = makeBatches(texts);
    const out = new Array<string>(texts.length);
    await Promise.all(
      batches.map((batch) =>
        this.limiter.run(async () => {
          const translated = await this.translateBatch(batch, target);
          batch.indices.forEach((idx, j) => (out[idx] = translated[j] ?? ''));
        }),
      ),
    );
    return out;
  }

  private async translateBatch(batch: Batch, target: TargetLang): Promise<string[]> {
    const raw = await this.requestWithRetry(batch.texts.join('\n'), target);
    const aligned = alignTranslations(raw, batch.texts.length);
    if (aligned) return aligned;
    // Line count mismatch → translate item by item.
    return mapWithConcurrency(batch.texts, ITEM_FALLBACK_CONCURRENCY, async (text) => {
      const one = await this.requestWithRetry(text, target);
      return alignTranslations(one, 1)?.[0] ?? one.trim();
    });
  }

  /** One request with endpoint fallback + exponential backoff (1 s, 2 s, 4 s). */
  async requestWithRetry(q: string, target: TargetLang): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      if (attempt > 0) await this.sleep(BACKOFF_MS[attempt - 1] as number);
      for (let k = 0; k < this.endpoints.length; k++) {
        const index = (this.preferred + k) % this.endpoints.length;
        const endpoint = this.endpoints[index] as GoogleEndpoint;
        try {
          const text = await this.requestOnce(q, target, endpoint);
          this.preferred = index;
          return text;
        } catch (err) {
          lastError = err;
          if (!(err instanceof RetryableError)) throw err;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async requestOnce(q: string, target: TargetLang, endpoint: GoogleEndpoint): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchFn(buildGoogleUrl(q, target, endpoint), {
        method: 'GET',
        credentials: 'omit',
      });
    } catch (err) {
      throw new RetryableError(`network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    const parsed = parseGoogleBody(body);
    if (parsed === null) throw new RetryableError('unexpected response body');
    return parsed;
  }
}
