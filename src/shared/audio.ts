// Audio helpers for live transcription: channel mixing and streaming downsampling to 16 kHz.

export const STT_SAMPLE_RATE = 16000;

/** Averages all channels into one mono buffer. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first.slice();
  const out = new Float32Array(first.length);
  for (const ch of channels) {
    for (let i = 0; i < out.length; i++) out[i]! += ch[i] ?? 0;
  }
  const k = 1 / channels.length;
  for (let i = 0; i < out.length; i++) out[i]! *= k;
  return out;
}

/**
 * Streaming box-filter downsampler (e.g. 48 kHz → 16 kHz). Each output sample is the average
 * of the input samples it covers, which also acts as a simple anti-aliasing low-pass.
 * State is kept between `push` calls so chunk boundaries do not produce clicks or drift.
 */
export class Downsampler {
  private readonly ratio: number;
  private acc = 0;
  private accWeight = 0;
  /** position inside the current output sample, in input samples (0 ≤ pos < ratio) */
  private pos = 0;

  constructor(
    readonly inRate: number,
    readonly outRate = STT_SAMPLE_RATE,
  ) {
    if (!(inRate > 0) || !(outRate > 0)) throw new Error('invalid sample rate');
    this.ratio = inRate / outRate;
  }

  push(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input.slice();
    const out = new Float32Array(Math.ceil((input.length + this.pos) / this.ratio) + 1);
    let n = 0;
    for (let i = 0; i < input.length; i++) {
      const x = input[i]!;
      const room = this.ratio - this.pos; // input samples still needed for this output sample
      if (room > 1) {
        this.acc += x;
        this.accWeight += 1;
        this.pos += 1;
      } else {
        // this input sample completes the output sample (partially, by `room`)
        this.acc += x * room;
        this.accWeight += room;
        out[n++] = this.acc / this.accWeight;
        const rest = 1 - room;
        this.acc = x * rest;
        this.accWeight = rest;
        this.pos = rest;
      }
    }
    return out.subarray(0, n).slice();
  }
}
