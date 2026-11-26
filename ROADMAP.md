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
| 4 | Subtitle delay adjustment (±, for out-of-sync subtitles) | todo |
| 8 | Sentence integrity: translate sentences split across cues together | todo |
| 12 | GitHub Actions: typecheck, tests, build and package on every push | todo |

## v0.3 — Speech-to-text (STT) for content without subtitles

Spike first (measure latency/quality on the user's machine), then productize.

- Audio capture: `chrome.tabCapture` (user-gesture: popup button or keyboard shortcut) →
  offscreen document → audio worklet (16 kHz mono). Works for any tab audio, not only `<video>`.
- STT engine options (decision pending):
  - **Local** (Whisper / Moonshine via transformers.js + WebGPU): free, private, offline;
    100–250 MB one-time model download, needs a decent GPU.
  - **Cloud streaming** (e.g. Deepgram, AssemblyAI, OpenAI realtime) with the user's own API
    key: best quality and latency, paid per hour of audio.
- Translation waits for sentence boundaries (shares logic with #8) to avoid flicker.
- Overlay without a `<video>` (e.g. podcasts, audio players): floating, draggable caption bar.
- Expected limits: ~1–3 s lag (cannot hear the future); DRM sites may block capture.

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
- 9. Alternative translators: DeepL or an LLM with the user's own API key (quality + 429 fallback)

### Distribution
- 10. Publish to the Chrome Web Store (store assets, privacy policy, permission justifications)
- 11. Firefox support
- 12. GitHub Actions CI → v0.2
