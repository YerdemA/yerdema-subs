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
- Translator keeps a sticky "preferred endpoint" (last one that worked); per attempt it tries every endpoint before applying the 1/2/4 s backoff. Non-JSON bodies (the HTML "Sorry" page) count as retryable. Non-429 4xx fail immediately.
- Item-by-item fallback (concurrency 3) runs inside the batch's global slot (max 2 batch slots), so total in-flight requests are bounded.
- Content side sends TRANSLATE messages of ≤ 40 texts each (one Google batch), so a failed batch only affects its own cues; the background also batches defensively.
- Concurrent persisted-cache saves are serialized through a promise chain to avoid read-modify-write races.
- Overlay host is a custom element `<yerdema-subs-overlay>` with an open Shadow DOM (page CSS targeting `div` can't hit it). Settings are applied as CSS variables, so live changes need no re-render.
- Generic mount uses `position: fixed` + `getBoundingClientRect()` updated by ResizeObserver, scroll (capture), resize, `fullscreenchange` and a 1 s safety interval. If the `<video>` element itself is the fullscreen element (native video fullscreen), nothing can be drawn over it (top layer) — known limitation; players that fullscreen a container work.
- Content-side `CueTranslator` drives prioritization: each request takes the next ≤ 40-text batch from `prioritizeCueIndices(currentTime)`, recomputed on every request (so seeks re-prioritize automatically), max 2 requests in flight.
- `sendTranslateMessage` retries an empty response / closed port up to 3 times (MV3 worker may be restarting), gives up immediately on "Extension context invalidated".
- Failed translations keep the English text visible (pending style) and set status `error`; they are retried when the cue list is replaced or the session restarts.
