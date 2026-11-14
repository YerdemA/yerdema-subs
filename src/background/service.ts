// Translation service: memory LRU + persisted per-video cache in front of a Translator.
import { LruCache, MEMORY_CACHE_MAX, PersistedVideoCache, type KeyValueStore } from '../shared/cache';
import type { TranslateResponse } from '../shared/types';
import type { Translator } from './translator';

export class TranslationService {
  private readonly memory = new LruCache<string, string>(MEMORY_CACHE_MAX);
  private readonly persisted: PersistedVideoCache | null;
  private saveChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly translator: Translator,
    store: KeyValueStore | null,
  ) {
    this.persisted = store ? new PersistedVideoCache(store) : null;
  }

  /** Never throws: always resolves to a TranslateResponse. */
  async handle(texts: readonly string[], videoKey?: string): Promise<TranslateResponse> {
    try {
      const translations = await this.translateAll(texts, videoKey);
      return { ok: true, translations };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async translateAll(texts: readonly string[], videoKey?: string): Promise<string[]> {
    const out = new Array<string>(texts.length).fill('');
    const missing = new Map<string, number[]>();

    let stored: Record<string, string> = {};
    if (videoKey && this.persisted) stored = await this.persisted.lookup(videoKey);

    texts.forEach((text, i) => {
      if (!text.trim()) return;
      const hit = this.memory.get(text) ?? stored[text];
      if (hit !== undefined) {
        out[i] = hit;
        this.memory.set(text, hit);
        return;
      }
      const list = missing.get(text);
      if (list) list.push(i);
      else missing.set(text, [i]);
    });

    if (missing.size === 0) return out;

    const uniqueTexts = [...missing.keys()];
    const translated = await this.translator.translate(uniqueTexts, 'tr');
    uniqueTexts.forEach((text, j) => {
      const tr = translated[j] ?? '';
      if (tr) this.memory.set(text, tr);
      for (const i of missing.get(text) ?? []) out[i] = tr;
    });

    if (videoKey && this.persisted) {
      const persisted = this.persisted;
      // Serialize read-modify-write cycles so concurrent saves don't drop entries.
      this.saveChain = this.saveChain
        .then(() => persisted.save(videoKey, uniqueTexts, translated))
        .catch(() => undefined);
      await this.saveChain;
    }
    return out;
  }
}
