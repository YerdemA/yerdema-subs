# Roadmap

## Vision

Let the user **understand and consume any English content in the browser without
interruption** — not only videos that ship subtitles. Language learning is a side benefit, not
the goal: comprehension and flow come first (low latency, no flicker, no clutter).

The long-term path is **speech-to-text (STT)**: capture the tab's audio, transcribe English
speech, translate it and show it in the same overlay. Existing subtitles remain the preferred
source when available (best quality, zero latency); STT is the fallback.

## v0.2 — Everyday polish (in progress)

| # | Item | Status |
|---|------|--------|
| 1 | Drag the subtitle to reposition it (saved per user, double-click resets) | done |
| 4 | Subtitle delay adjustment (±0.5 s steps in the popup, per video) | done |
| 8 | Sentence integrity: translate sentences split across cues together | done |
| 12 | GitHub Actions: typecheck, tests, build and package on every push | todo |

## v0.3 — Speech-to-text (STT) for content without subtitles

**Decided:** no budget → **local only, free** (no paid cloud APIs). Target hardware: the user's
GTX 1650 Ti (4 GB VRAM) via WebGPU, with a WASM/CPU fallback.

Source priority (user's design), per page:
1. **Subtitles** (existing v0.1 pipeline) — best quality, zero latency.
2. **Audio file found on the page** → process the file directly, *ahead of the playhead*
   (same "current position first, then the rest" prioritization as translation). No live lag.
   Works when the media URL is a plain file (mp3/m4a/mp4/ogg/wav: podcasts, news sites,
   simple players). Not possible for `blob:`/MSE streams (YouTube, most course platforms) —
   YouTube is covered by tier 1 anyway (auto captions).
3. **Live transcription** of the tab's audio (`chrome.tabCapture` → offscreen document) —
   universal fallback with ~1–3 s lag; DRM sites may block capture.

Plan:
- Spike: run Whisper (base/small) and Moonshine (tiny/base) via transformers.js + WebGPU on the
  1650 Ti; measure speed (× real-time), accuracy and memory. Pick the model.
- Shared STT engine in an offscreen document (model loaded once, one-time download cached).
- Tier 3 (live) next: it makes "works everywhere" true. Then tier 2 as the quality/latency
  upgrade where a file URL exists.
- Translation waits for sentence boundaries (shares logic with #8) to avoid flicker.
- Overlay without a `<video>` (e.g. `<audio>` players, podcasts): floating, draggable bar.

## Backlog (all ideas, unordered within groups)

### User experience
- 1. Drag-to-reposition subtitle → v0.2
- 2. Click an English word to see its meaning (lower priority: learning is not the main goal)
- 3. Style options: font, background opacity, shadow
- 4. Subtitle delay adjustment → v0.2

### Coverage
- 5. Source language selection (German, Spanish, …) — infrastructure mostly ready
- 6. YouTube embeds on other sites, YouTube Shorts
- 7. Dedicated support / checks for Coursera, Udemy, Vimeo (many are plain HTML5)

### Translation quality
- 8. Sentence integrity across cues → v0.2
- 9. Alternative translators — **free options only** (budget: none); e.g. a local model later

### Distribution
- 10. Publish to the Chrome Web Store (store assets, privacy policy, permission justifications)
- 11. Firefox support
- 12. GitHub Actions CI → v0.2
