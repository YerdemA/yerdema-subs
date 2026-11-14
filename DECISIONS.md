# DECISIONS

Decisions taken before development (by the user):
- Translation provider: unofficial Google Translate endpoint (`client=gtx`), no API key.
- Scope: YouTube (dedicated adapter) + generic HTML5 `textTracks`. No Netflix/Prime/Disney.
- Display: configurable — TR only or TR + EN, size/position/background adjustable.
- Stack: TypeScript + Vite, Manifest V3, Chrome + Edge.
- Name: Yerdema Subs (repo `yerdema-subs`). UI languages: Turkish + English.
- Git: local only, frequent commits, no push.

Decisions taken during development (append below, one line each: decision — reason):
- `translate.googleapis.com` (client=gtx) returned HTTP 429 "unusual traffic" to every curl probe from this machine; `clients5.google.com/translate_a/single?client=dict-chrome-ex&dt=t` returned the identical nested-array format — the translator tries the spec endpoint first and falls back to clients5 on 429/non-JSON; both hosts are in `host_permissions`. The fixture `google-sample.json` was captured from clients5 (same shape).
- Google splits the response into sentence segments that do not map 1:1 to input lines — always concatenate all `data[0][i][0]` and then split on `\n` (never map segments to cues).
- The GitHub URL the user mentioned is informational only; per CLAUDE.md no remote is added and nothing is pushed.
- Manifest source lives in `src/manifest.json`; the build injects `version` from `package.json` — single source for the version.
- Popup is built with Vite root `src/popup` → `dist/popup/index.html`; background/content are Vite lib builds (ES / IIFE) via `scripts/build.mjs`.
- `scripts/verify-dist.mjs` runs as part of `npm run build` (not only `package`) so every build is validated.
- Dev deps: TypeScript 7, Vite 8, Vitest 5, jsdom, sharp (icons), fflate (zip), rimraf.
- Persisted per-video cache stores a `text → translation` map (not a positional array) under `vc:<videoKey>` with a timestamp — stays valid if the cue list changes (manual vs ASR track, re-merge) and allows merging partial, priority-ordered results; LRU by timestamp keeps 30 videos.
- `findActiveCue`: start inclusive / end exclusive; for overlapping cues the latest-started still-active cue wins.
- ASR json3 is exploded into word fragments via `tOffsetMs`; overlapping rolling events are clamped (fragment end ≤ next fragment start) before `mergeCues`, otherwise inflated event durations would trigger the 7 s break too early. The 7 s limit is checked on the merged span `max(end) - start`.
- Manual json3 events without `dDurationMs` end at the next event's start (3 s if last). HTML entities in caption text are decoded (`&#39;`, `&amp;`, ...).
- Translation priority window: cues with `end ≥ t-5s` and `start ≤ t+60s` first, then later cues, then earlier ones.
