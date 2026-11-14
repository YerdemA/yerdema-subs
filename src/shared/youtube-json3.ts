// YouTube "json3" timedtext parsing and ASR fragment merging.
import { cleanCueText, normalizeText } from './cues';
import { isRecord, type Cue } from './types';

export interface Fragment {
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  text: string;
}

export const MERGE_LIMITS = {
  maxGapSec: 1.2,
  maxDurationSec: 7,
  maxChars: 120,
} as const;

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

interface Json3Event {
  startMs: number;
  durationMs: number | undefined;
  segs: Array<{ text: string; offsetMs: number | undefined }>;
}

function readEvents(json: unknown): Json3Event[] {
  let data: unknown = json;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return [];
    }
  }
  if (!isRecord(data) || !Array.isArray(data.events)) return [];
  const out: Json3Event[] = [];
  for (const ev of data.events as unknown[]) {
    if (!isRecord(ev) || !Array.isArray(ev.segs)) continue;
    const startMs = num(ev.tStartMs);
    if (startMs === undefined) continue;
    const segs: Json3Event['segs'] = [];
    for (const seg of ev.segs as unknown[]) {
      if (!isRecord(seg) || typeof seg.utf8 !== 'string') continue;
      if (seg.utf8 === '\n') continue;
      segs.push({ text: seg.utf8, offsetMs: num(seg.tOffsetMs) });
    }
    if (segs.length === 0) continue;
    out.push({ startMs, durationMs: num(ev.dDurationMs), segs });
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/** True when the payload is a json3 document with an `events` array. */
export function isJson3(json: unknown): boolean {
  let data: unknown = json;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return false;
    }
  }
  return isRecord(data) && Array.isArray(data.events);
}

/**
 * Manual captions: one cue per event (segments concatenated, normalized).
 * Events without a duration end at the next event's start.
 */
export function parseManualJson3(json: unknown): Cue[] {
  const events = readEvents(json);
  const cues: Cue[] = [];
  events.forEach((ev, i) => {
    const text = cleanCueText(ev.segs.map((s) => s.text).join(''));
    if (!text) return;
    const start = ev.startMs / 1000;
    const next = events[i + 1];
    const endMs =
      ev.durationMs !== undefined ? ev.startMs + ev.durationMs : next ? next.startMs : ev.startMs + 3000;
    cues.push({ id: cues.length, start, end: Math.max(start, endMs / 1000), text });
  });
  return cues;
}

/**
 * ASR captions: explode every event into word-level fragments using `tOffsetMs`.
 * A fragment ends where the next fragment of the same event starts (or at the event end).
 */
export function parseAsrFragments(json: unknown): Fragment[] {
  const events = readEvents(json);
  const frags: Fragment[] = [];
  for (const ev of events) {
    const evEndMs = ev.startMs + (ev.durationMs ?? 2000);
    ev.segs.forEach((seg, i) => {
      const text = cleanCueText(seg.text);
      if (!text) return;
      const startMs = ev.startMs + (seg.offsetMs ?? 0);
      const nextSeg = ev.segs[i + 1];
      const endMs = nextSeg ? ev.startMs + (nextSeg.offsetMs ?? 0) : evEndMs;
      frags.push({ start: startMs / 1000, end: Math.max(startMs, endMs) / 1000, text });
    });
  }
  frags.sort((a, b) => a.start - b.start);
  // Rolling ASR events overlap: clamp each fragment so it ends no later than the next one starts.
  for (let i = 0; i < frags.length - 1; i++) {
    const cur = frags[i] as Fragment;
    const next = frags[i + 1] as Fragment;
    if (next.start > cur.start && next.start < cur.end) cur.end = next.start;
  }
  return frags;
}

const SENTENCE_END = /[.?!…]["')\]]*$/;

/**
 * Merges fragments into sentence-like cues: break at sentence ends (.?!), at gaps longer than
 * 1.2 s, or before the cue would exceed 7 s / 120 chars. Each cue's end is
 * min(next cue start, own end).
 */
export function mergeCues(fragments: readonly Fragment[], limits = MERGE_LIMITS): Cue[] {
  const merged: Array<{ start: number; end: number; parts: string[]; len: number }> = [];
  let cur: { start: number; end: number; parts: string[]; len: number } | null = null;

  const flush = (): void => {
    if (cur && cur.parts.length > 0) merged.push(cur);
    cur = null;
  };

  for (const frag of fragments) {
    const text = normalizeText(frag.text);
    if (!text) continue;
    if (cur) {
      const c: { start: number; end: number; parts: string[]; len: number } = cur;
      const gap = frag.start - c.end;
      const wouldLen = c.len + 1 + text.length;
      const wouldDur = Math.max(c.end, frag.end) - c.start;
      if (gap > limits.maxGapSec || wouldLen > limits.maxChars || wouldDur > limits.maxDurationSec) {
        flush();
      }
    }
    if (!cur) {
      cur = { start: frag.start, end: frag.end, parts: [text], len: text.length };
    } else {
      const c: { start: number; end: number; parts: string[]; len: number } = cur;
      c.parts.push(text);
      c.len += 1 + text.length;
      c.end = Math.max(c.end, frag.end);
    }
    if (SENTENCE_END.test(text)) flush();
  }
  flush();

  return merged.map((m, i) => {
    const next = merged[i + 1];
    const end = next ? Math.min(next.start, m.end) : m.end;
    return { id: i, start: m.start, end: Math.max(m.start, end), text: normalizeText(m.parts.join(' ')) };
  });
}

/** Full pipeline: json3 payload → cues. `kind === 'asr'` selects fragment merging. */
export function json3ToCues(json: unknown, kind: string): Cue[] {
  if (kind === 'asr') return mergeCues(parseAsrFragments(json));
  return parseManualJson3(json);
}
