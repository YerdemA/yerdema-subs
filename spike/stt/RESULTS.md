# STT spike — results (2026-11-26)

Machine: GTX 1650 Ti (4 GB, Turing, WebGPU `shader-f16` available), Chromium (Playwright),
transformers.js 4.3.2. Dtype "mixed" = encoder fp32 + decoder q4.
Audio: `jfk.wav` (11 s, known transcript) and `ted_60_16k.wav` (60 s TED talk, clean speech).
Raw data: `results-first-run.json`, `results-cached-load.json`. Re-run: `node spike/stt/run.mjs`.

| Model | Device | Download | Load (cached) | JFK WER | 5 s chunk avg / p90 | 60 s file | WER file / 5 s chunks* |
|---|---|---|---|---|---|---|---|
| moonshine-tiny | WebGPU | 76 MB | — | 0 % | 0.57 / 0.84 s | 6.6 s (9.1×) | 11.1 % / 15.2 % |
| **moonshine-base** | WebGPU | 154 MB | **3.4 s** | 0 % | **0.71 / 0.96 s** | 8.2 s (7.3×) | 9.1 % / **11.6 %** |
| whisper-base.en | WebGPU | 206 MB | 2.2 s | 0 % | 0.81 / 1.02 s | 7.2 s (8.3×) | 8.1 % / 18.7 % |
| whisper-small.en | WebGPU | 586 MB | — | 0 % | 1.61 / 1.88 s | 15.0 s (4.0×) | ref / 7.6 % |
| moonshine-base | WASM (CPU) | 154 MB | — | 0 % | 1.28 / 1.61 s | 16.2 s (3.7×) | 7.1 % / 15.7 % |

\* WER against whisper-small.en's full-file transcript (no human reference for the TED clip).
"×" = times faster than real time.

## Conclusions

- **Feasible on this GPU.** Every model runs faster than real time; even CPU-only (WASM) works.
- **Live (tier 3): moonshine-base on WebGPU.** ~0.7 s to transcribe 5 s of audio and the best
  accuracy on short chunks. Whisper degrades on short chunks (drops/duplicates words at cuts).
- **File (tier 2): whisper-small.en is an optional "high quality" choice** (4× real time is
  plenty when processing ahead of the playhead), but 586 MB; moonshine-base is the default.
- **Fallback without a usable GPU:** moonshine-base on WASM (≈1.3 s per 5 s chunk).
- Fixed 5 s cuts split words/sentences ("which means" lost). The product needs **VAD-based
  segmentation** (cut at pauses, e.g. Silero VAD ~2 MB) — also gives natural sentence units
  for translation.
- Expected live lag: end of phrase → text ≈ 0.7 s (STT) + ~0.3 s (translation) ≈ **1–1.5 s**.
- First use: one-time model download (154 MB), then ~3 s load from cache.

## Open risks for the product build
- Extension CSP forbids remote code → transformers.js + ONNX Runtime WASM files must be
  bundled (first runtime dependency; extension zip grows by ~20–25 MB). Models are data and can
  be downloaded at runtime and cached.
- Needs `'wasm-unsafe-eval'` in the extension CSP; WebGPU inside an offscreen document must be
  verified.
- Clean TED speech was tested; music/noise/accents will lower accuracy.
