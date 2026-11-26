// Energy-based voice activity segmentation for live transcription (16 kHz mono input).
// Cuts speech at pauses so each segment is roughly one phrase/sentence; long monologues are
// cut at the quietest recent point. Emits growing "interim" snapshots while speech continues
// so the overlay can show the English text early.

export const VAD_DEFAULTS = {
  sampleRate: 16000,
  /** analysis frame: 30 ms */
  frameSamples: 480,
  /** consecutive speech frames needed to open a segment (90 ms) */
  startFrames: 3,
  /** silence that closes a segment */
  endSilenceMs: 600,
  /** audio kept before speech onset */
  preRollMs: 300,
  /** silence kept after speech end */
  tailMs: 200,
  /** hard limit; longer speech is cut at the quietest point of the last `cutSearchMs` */
  maxSegmentMs: 8000,
  cutSearchMs: 2000,
  /** segments with less voiced audio are dropped (clicks, coughs) */
  minVoicedMs: 300,
  /** interim snapshot cadence while speaking */
  interimEveryMs: 1200,
  /** absolute speech threshold (RMS ≈ −46 dBFS) */
  minSpeechRms: 0.005,
  /** speech when RMS exceeds noise floor × this */
  floorFactor: 3,
} as const;

export type VadOptions = typeof VAD_DEFAULTS;

export type SegmentEvent =
  | { kind: 'interim'; id: number; audio: Float32Array }
  | { kind: 'final'; id: number; audio: Float32Array }
  /** the segment turned out to be noise; drop any interim text shown for it */
  | { kind: 'discard'; id: number };

export function rms(frame: Float32Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i]! * frame[i]!;
  return Math.sqrt(s / Math.max(1, frame.length));
}

function concat(parts: readonly Float32Array[]): Float32Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export class Segmenter {
  private readonly opt: VadOptions;
  private readonly msPerFrame: number;
  private pending = new Float32Array(0);
  private noiseFloor = 0.001;
  private preRoll: Float32Array[] = [];
  private onsetRun = 0;
  private nextId = 1;
  // current segment
  private active = false;
  private frames: Float32Array[] = [];
  private energies: number[] = [];
  private voiced = 0;
  private silenceRun = 0;
  private lastInterimFrames = 0;

  constructor(options: Partial<VadOptions> = {}) {
    this.opt = { ...VAD_DEFAULTS, ...options };
    this.msPerFrame = (this.opt.frameSamples / this.opt.sampleRate) * 1000;
  }

  get inSpeech(): boolean {
    return this.active;
  }

  /** Feeds 16 kHz mono samples; returns the events produced. */
  push(samples: Float32Array): SegmentEvent[] {
    const events: SegmentEvent[] = [];
    const buf = this.pending.length ? concat([this.pending, samples]) : samples;
    const fs = this.opt.frameSamples;
    let off = 0;
    for (; off + fs <= buf.length; off += fs) this.frame(buf.slice(off, off + fs), events);
    this.pending = buf.slice(off);
    return events;
  }

  /** Closes the open segment (e.g. capture stopped). */
  flush(): SegmentEvent[] {
    const events: SegmentEvent[] = [];
    if (this.active) this.close(this.frames.length, events);
    return events;
  }

  private isSpeech(e: number): boolean {
    return e > Math.max(this.opt.minSpeechRms, this.noiseFloor * this.opt.floorFactor);
  }

  private frame(f: Float32Array, events: SegmentEvent[]): void {
    const e = rms(f);
    const speech = this.isSpeech(e);
    // Noise floor: follows quiet frames quickly, creeps up slowly (music beds, hum).
    if (!speech) this.noiseFloor = Math.max(1e-5, this.noiseFloor * 0.9 + e * 0.1);
    else this.noiseFloor *= 1.002;
    if (e < this.noiseFloor) this.noiseFloor = Math.max(1e-5, e);

    if (!this.active) {
      this.preRoll.push(f);
      const maxPre = Math.ceil(this.opt.preRollMs / this.msPerFrame) + this.opt.startFrames;
      if (this.preRoll.length > maxPre) this.preRoll.shift();
      this.onsetRun = speech ? this.onsetRun + 1 : 0;
      if (this.onsetRun >= this.opt.startFrames) {
        this.active = true;
        this.frames = this.preRoll;
        this.energies = this.preRoll.map(rms);
        this.voiced = this.onsetRun;
        this.silenceRun = 0;
        this.lastInterimFrames = 0;
        this.preRoll = [];
        this.onsetRun = 0;
      }
      return;
    }

    this.frames.push(f);
    this.energies.push(e);
    if (speech) {
      this.voiced++;
      this.silenceRun = 0;
    } else {
      this.silenceRun++;
    }

    if (this.silenceRun * this.msPerFrame >= this.opt.endSilenceMs) {
      const tail = Math.ceil(this.opt.tailMs / this.msPerFrame);
      this.close(this.frames.length - this.silenceRun + tail, events);
      return;
    }
    if (this.frames.length * this.msPerFrame >= this.opt.maxSegmentMs) {
      // Cut at the quietest frame of the recent window; keep the rest as the next segment.
      const search = Math.ceil(this.opt.cutSearchMs / this.msPerFrame);
      let cut = this.frames.length;
      let best = Infinity;
      for (let i = this.frames.length - search; i < this.frames.length; i++) {
        const v = this.energies[i] ?? Infinity;
        if (i > 0 && v < best) {
          best = v;
          cut = i;
        }
      }
      this.close(cut, events, true);
      return;
    }
    const sinceInterim = (this.frames.length - this.lastInterimFrames) * this.msPerFrame;
    if (sinceInterim >= this.opt.interimEveryMs && this.voiced * this.msPerFrame >= this.opt.minVoicedMs) {
      this.lastInterimFrames = this.frames.length;
      events.push({ kind: 'interim', id: this.nextId, audio: concat(this.frames) });
    }
  }

  /** Emits the first `keep` frames as the segment; optionally continues with the remainder. */
  private close(keep: number, events: SegmentEvent[], continueAfter = false): void {
    const id = this.nextId++;
    const kept = this.frames.slice(0, Math.min(keep, this.frames.length));
    const rest = this.frames.slice(kept.length);
    const restEnergies = this.energies.slice(kept.length);
    const voicedMs = this.voiced * this.msPerFrame;
    if (voicedMs >= this.opt.minVoicedMs) events.push({ kind: 'final', id, audio: concat(kept) });
    else if (this.lastInterimFrames > 0) events.push({ kind: 'discard', id });

    if (continueAfter) {
      this.frames = rest;
      this.energies = restEnergies;
      this.voiced = restEnergies.filter((x) => this.isSpeech(x)).length;
      this.silenceRun = 0;
      this.lastInterimFrames = 0;
      return;
    }
    this.active = false;
    this.frames = [];
    this.energies = [];
    this.voiced = 0;
    this.silenceRun = 0;
    this.lastInterimFrames = 0;
    this.preRoll = [];
  }
}
