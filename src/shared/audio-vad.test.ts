import { describe, expect, it } from 'vitest';
import { Downsampler, mixToMono } from './audio';
import { Segmenter, type SegmentEvent } from './vad';

const SR = 16000;
const tone = (sec: number, amp = 0.2, freq = 220, rate = SR): Float32Array =>
  Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate));
const noise = (sec: number, amp = 0.0005): Float32Array =>
  Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => amp * Math.sin(i * 12.9898) );
const cat = (...parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
/** Feeds audio in 4096-sample chunks like a ScriptProcessor would. */
function feed(seg: Segmenter, audio: Float32Array): SegmentEvent[] {
  const ev: SegmentEvent[] = [];
  for (let i = 0; i < audio.length; i += 4096) ev.push(...seg.push(audio.subarray(i, i + 4096)));
  return ev;
}
const finals = (ev: SegmentEvent[]) => ev.filter((e) => e.kind === 'final') as Array<{ kind: 'final'; id: number; audio: Float32Array }>;

describe('mixToMono / Downsampler', () => {
  it('averages channels', () => {
    expect(Array.from(mixToMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5]);
  });

  it('downsamples 48k → 16k with the right length across chunk boundaries', () => {
    const d = new Downsampler(48000);
    let n = 0;
    for (let i = 0; i < 10; i++) n += d.push(new Float32Array(4096).fill(0.5)).length;
    expect(Math.abs(n - (40960 / 3))).toBeLessThanOrEqual(1);
    const out = d.push(new Float32Array(300).fill(0.5));
    expect(out.every((x) => Math.abs(x - 0.5) < 1e-6)).toBe(true);
  });

  it('handles non-integer ratios (44.1k) without drift', () => {
    const d = new Downsampler(44100);
    let n = 0;
    for (let i = 0; i < 100; i++) n += d.push(new Float32Array(441).fill(-0.25)).length;
    expect(Math.abs(n - 16000)).toBeLessThanOrEqual(1);
  });
});

describe('Segmenter', () => {
  it('emits one final per phrase separated by pauses, with pre-roll and tail', () => {
    const seg = new Segmenter();
    const ev = feed(seg, cat(noise(1), tone(1.5), noise(1), tone(2), noise(1)));
    const f = finals(ev);
    expect(f).toHaveLength(2);
    expect(f[0]!.id).toBeLessThan(f[1]!.id);
    // 1.5 s speech + ≤0.39 s pre-roll + 0.2 s tail
    expect(f[0]!.audio.length / SR).toBeGreaterThan(1.5);
    expect(f[0]!.audio.length / SR).toBeLessThan(2.2);
  });

  it('emits growing interim snapshots during long speech, then the final with the same id', () => {
    const seg = new Segmenter();
    const ev = feed(seg, cat(noise(0.5), tone(4), noise(1)));
    const interims = ev.filter((e) => e.kind === 'interim');
    expect(interims.length).toBeGreaterThanOrEqual(2);
    const f = finals(ev);
    expect(f).toHaveLength(1);
    expect(interims.every((e) => e.id === f[0]!.id)).toBe(true);
  });

  it('cuts very long speech into segments no longer than the limit', () => {
    const seg = new Segmenter();
    const ev = feed(seg, cat(tone(20), noise(1)));
    const f = finals(ev);
    expect(f.length).toBeGreaterThanOrEqual(3);
    expect(f.every((e) => e.audio.length / SR <= 8.05)).toBe(true);
    const total = f.reduce((n, e) => n + e.audio.length, 0) / SR;
    expect(total).toBeGreaterThan(19);
  });

  it('ignores short clicks and steady low noise', () => {
    const seg = new Segmenter();
    const ev = feed(seg, cat(noise(2), tone(0.12), noise(2)));
    expect(finals(ev)).toHaveLength(0);
  });

  it('flush closes an open segment', () => {
    const seg = new Segmenter();
    feed(seg, cat(noise(0.5), tone(1)));
    expect(seg.inSpeech).toBe(true);
    expect(finals(seg.flush())).toHaveLength(1);
    expect(seg.inSpeech).toBe(false);
  });
});
