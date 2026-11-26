// Content-side translation driver: sends cue texts to the background in priority order
// (current position first, then the rest), at most 2 requests in flight, and applies results.
import { makeBatches } from '../shared/batching';
import { prioritizeCueIndices } from '../shared/cues';
import { translationUnit } from '../shared/sentences';
import type { Cue, TranslateResponse } from '../shared/types';

export type SendTranslate = (texts: string[], videoKey?: string) => Promise<TranslateResponse>;

export type TranslationState = 'idle' | 'translating' | 'done' | 'error';

export const MAX_IN_FLIGHT = 2;
/** Failed texts are retried automatically: 20 s, 40 s, 80 s, 160 s, 300 s, then give up. */
export const RETRY_FAILED_MS = 20000;
export const RETRY_FAILED_MAX_MS = 300000;
export const MAX_AUTO_RETRIES = 5;

export class CueTranslator {
  private cues: Cue[] = [];
  private readonly known = new Map<string, string>();
  private readonly inFlight = new Set<string>();
  private readonly failed = new Set<string>();
  private active = 0;
  private destroyed = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private autoRetries = 0;
  lastError: string | undefined;

  constructor(
    private readonly send: SendTranslate,
    private readonly getTime: () => number,
    private readonly onUpdate: () => void,
    private readonly videoKey?: string,
  ) {}

  get state(): TranslationState {
    if (this.cues.length === 0) return 'idle';
    if (this.pendingCount() > 0) return 'translating';
    return this.failed.size > 0 ? 'error' : 'done';
  }

  /** Replaces the cue list (keeps known translations) and starts translating. */
  setCues(cues: Cue[]): void {
    this.cues = cues;
    this.applyKnown();
    this.pump();
  }

  /** Re-evaluates priorities (call after a seek). Cheap; in-flight requests are kept. */
  reprioritize(): void {
    this.pump();
  }

  /** Clears failure marks and tries the failed texts again. */
  retryFailed(): void {
    this.failed.clear();
    this.lastError = undefined;
    this.pump();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
  }

  private pendingCount(): number {
    let n = 0;
    for (const c of this.cues) {
      if (c.translation === undefined && !this.failed.has(translationUnit(c))) n++;
    }
    return n;
  }

  private applyKnown(): void {
    for (const c of this.cues) {
      const tr = this.known.get(translationUnit(c));
      if (tr !== undefined) c.translation = tr;
    }
  }

  private nextChunk(): string[] {
    const order = prioritizeCueIndices(this.cues, this.getTime());
    const texts: string[] = [];
    const seen = new Set<string>();
    for (const i of order) {
      const c = this.cues[i];
      if (!c || c.translation !== undefined) continue;
      const t = translationUnit(c);
      if (seen.has(t) || this.inFlight.has(t) || this.failed.has(t) || this.known.has(t)) continue;
      seen.add(t);
      texts.push(t);
      if (texts.length >= 400) break; // enough to build one batch
    }
    const first = makeBatches(texts)[0];
    return first ? first.texts : [];
  }

  private pump(): void {
    if (this.destroyed) return;
    while (this.active < MAX_IN_FLIGHT) {
      const chunk = this.nextChunk();
      if (chunk.length === 0) break;
      this.active++;
      chunk.forEach((t) => this.inFlight.add(t));
      void this.run(chunk);
    }
  }

  private async run(chunk: string[]): Promise<void> {
    let res: TranslateResponse;
    try {
      res = await this.send(chunk, this.videoKey);
    } catch (err) {
      res = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    this.active--;
    chunk.forEach((t) => this.inFlight.delete(t));
    if (this.destroyed) return;

    if (res.ok) {
      chunk.forEach((text, i) => {
        const tr = res.ok ? res.translations[i] : undefined;
        if (typeof tr === 'string' && tr.trim() !== '') this.known.set(text, tr);
        else this.failed.add(text);
      });
      this.applyKnown();
    } else {
      this.lastError = res.error;
      chunk.forEach((t) => this.failed.add(t));
    }
    if (res.ok && this.failed.size === 0) this.autoRetries = 0;
    if (this.failed.size > 0 && this.retryTimer === undefined && this.autoRetries < MAX_AUTO_RETRIES) {
      const delay = Math.min(RETRY_FAILED_MS * 2 ** this.autoRetries, RETRY_FAILED_MAX_MS);
      this.autoRetries++;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined;
        if (!this.destroyed) this.retryFailed();
      }, delay);
    }
    this.onUpdate();
    this.pump();
  }
}

/**
 * Sends a TRANSLATE message to the background. The MV3 service worker can be killed at any
 * time: an undefined response or a closed port is retried a few times.
 */
export async function sendTranslateMessage(
  texts: string[],
  videoKey?: string,
  attempts = 3,
): Promise<TranslateResponse> {
  let lastError = 'no response';
  for (let i = 0; i < attempts; i++) {
    try {
      const res: unknown = await chrome.runtime.sendMessage({ type: 'TRANSLATE', texts, videoKey });
      if (isTranslateResponse(res)) return res;
      lastError = 'empty response';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (/context invalidated/i.test(lastError)) break; // extension reloaded; give up
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return { ok: false, error: lastError };
}

function isTranslateResponse(value: unknown): value is TranslateResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.ok === true) return Array.isArray(v.translations);
  if (v.ok === false) return typeof v.error === 'string';
  return false;
}
