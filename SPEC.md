# Yerdema Subs — Specification (v0.1.0)

A Chrome/Edge (Manifest V3) browser extension that reads the **English subtitles** of the video
playing in the browser, translates them to **Turkish** in real time and shows them as an overlay
on top of the video.

This document is the single source of truth. Where it says MUST, do it. Where something is not
specified, pick the simplest reasonable option and log it in `DECISIONS.md`.

---

## 1. Scope

### In scope (v0.1.0)
- **YouTube** (`www.youtube.com/watch`, `/shorts` excluded): dedicated adapter.
- **Generic HTML5 video**: any page whose `<video>` element exposes subtitles through native
  `textTracks` (`<track kind="subtitles|captions">`), including inside iframes (`all_frames`).
- Translation via the **unofficial Google Translate endpoint** (no API key).
- Overlay subtitles with user settings (mode, size, position, background).
- Popup UI, keyboard shortcut, TR + EN interface (Chrome i18n).
- Browsers: **Chrome and Edge** (same build, Chromium MV3). Minimum Chrome 111 (needed for
  `"world": "MAIN"` content scripts).

### Out of scope (do NOT build)
- Videos without any subtitle track (speech-to-text / Whisper / tab audio capture).
- Netflix, Prime Video, Disney+, Twitch, custom JS players that render captions as DOM text
  (other than YouTube).
- Live streams.
- Firefox / Safari.
- Any paid API, any backend/server, any analytics, any account/login.
- Chrome Web Store publishing (only produce a zip that is ready to upload).

---

## 2. Tech stack & constraints
- **TypeScript (strict)** + **Vite**. No extension framework (no WXT, no Plasmo, no CRXJS).
- Package manager: **npm**. Node **20+**.
- Tests: **Vitest** (jsdom environment where DOM is needed).
- No UI framework for the popup — plain TS + HTML + CSS (small and fast).
- Runtime dependencies: **none** (everything is hand-written). Dev dependencies are fine.
- Content scripts MUST be built as **self-contained IIFE bundles** (no `import` statements in the
  output) because MV3 content scripts are not ES modules. Background service worker may be an ES
  module (`"type": "module"`).
- Development OS of the user is **Windows 11**. All npm scripts MUST be cross-platform (no `rm -rf`,
  no `cp` in package.json scripts — use Node scripts or packages like `rimraf`).

### Commands that MUST exist and pass
| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, zero errors |
| `npm test` | Vitest, all green |
| `npm run build` | produces a loadable unpacked extension in `dist/` |
| `npm run package` | build + zip `dist/` into `release/yerdema-subs-v<version>.zip` |
| `npm run icons` | generates PNG icons from `assets/icon.svg` |
| `npm run serve:test` | serves `test-page/` over http://localhost (for manual/E2E testing) |

---

## 3. Architecture

```
src/
  shared/            pure, testable logic (no chrome.* calls unless noted)
    types.ts         Cue, Settings, messages
    settings.ts      defaults + load/save/subscribe (chrome.storage.sync)
    cues.ts          findActiveCue (binary search), normalizeText
    youtube-json3.ts parse YouTube json3 → raw cues; mergeCues (ASR word-level → sentences)
    batching.ts      split texts into request batches by encoded length
    google.ts        build request URL, parse response, align results
    cache.ts         in-memory LRU + persisted per-video cache helpers
    i18n.ts          t(key) wrapper over chrome.i18n.getMessage
  background/
    index.ts         service worker: translation queue, fetch, retry/backoff, cache, commands
  content/
    main.ts          isolated-world entry: picks adapter by hostname, owns lifecycle
    overlay.ts       Shadow-DOM overlay renderer
    sync.ts          rAF loop: video.currentTime → active cue → overlay
    adapters/
      youtube.ts     YouTube adapter (isolated world)
      html5.ts       generic textTracks adapter
    youtube-main-world.ts  MAIN-world script: XHR/fetch interceptor for /api/timedtext
  popup/
    index.html, popup.ts, popup.css
_locales/
  en/messages.json, tr/messages.json
assets/icon.svg
public/icons/ (generated PNGs: 16, 32, 48, 128)
test-page/ index.html, sample.en.vtt
scripts/  build helpers, zip, icons, static server
```

### 3.1 Data model
```ts
interface Cue { id: number; start: number; end: number; text: string; translation?: string }
// start/end in seconds, text is single-line normalized English (whitespace collapsed).

interface Settings {
  enabled: boolean;              // default true
  mode: 'tr' | 'tr+en';          // default 'tr'
  fontSize: number;              // px, 14–48, default 24
  bottomOffset: number;          // % of video height from bottom, 2–40, default 10
  bgOpacity: number;             // 0–1, default 0.6
  hideOriginal: boolean;         // hide the site's native captions, default true
}
```

### 3.2 Messages (typed, discriminated unions in `types.ts`)
- content → background: `{ type: 'TRANSLATE', texts: string[], videoKey?: string }`
  → response `{ ok: true, translations: string[] } | { ok: false, error: string }`
- popup → content (`chrome.tabs.sendMessage`): `{ type: 'GET_STATUS' }`
  → `{ status: Status }` where
  `Status = 'idle' | 'no-video' | 'no-subtitles' | 'translating' | 'active' | 'error' | 'disabled'`
  plus optional `detail: string` and `source: 'youtube-intercept' | 'youtube-dom' | 'html5'`.
- MAIN world → isolated world: `window.postMessage({ source: 'yerdema-subs', type: 'YT_CAPTIONS',
  videoId, lang, kind, json })`. The isolated script MUST verify `event.source === window` and the
  `source` field.
- Settings changes propagate via `chrome.storage.onChanged` (no messages needed).

---

## 4. Translation (background service worker)

### 4.1 Endpoint
`GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=<encoded>`

Response is a nested array. `data[0]` is an array of segments; each segment's `[0]` is translated
text. Concatenate all `data[0][i][0]` strings in order to get the full translated text.
**Verify this format with a real request (`curl`) during Phase 1 before relying on it**, and
store a captured sample response as a test fixture (`src/shared/__fixtures__/google-sample.json`).

### 4.2 Batching
- Cue texts never contain newlines (normalized). Join a batch with `\n`, translate, split result by
  `\n`.
- Batch limit: encoded `q` length ≤ **4000** characters and ≤ **40** cues.
- If the split result count ≠ input count → retry that batch item-by-item (concurrency 3).
- Prioritize: first translate the cues from `currentTime - 5s` forward (next ~60 s), then the rest
  of the video in order.
- Max **2** concurrent batch requests globally.

### 4.3 Errors
- HTTP 429 / 5xx / network error → exponential backoff 1 s, 2 s, 4 s (3 retries), then fail the
  batch with an error (content shows original English text for those cues and status `error`).
- Never throw unhandled errors in the service worker.

### 4.4 Caching
- In-memory LRU map `text → translation` (max 5000 entries) in the service worker.
- Persisted cache: `chrome.storage.local` keyed by `videoKey` (e.g. `yt:<videoId>:<lang>`) storing
  the array of translations; keep only the **30 most recent** videos (LRU by timestamp).
- The service worker can be killed at any time (MV3) — the in-memory cache is only an
  optimisation; correctness must not depend on it.

### 4.5 Provider abstraction
Define `interface Translator { translate(texts: string[], target: 'tr'): Promise<string[]> }`
and implement `GoogleGtxTranslator`. Do not implement other providers, but the code must make
adding DeepL later a one-file change.

---

## 5. Subtitle sources

### 5.1 YouTube adapter
**Primary — intercept (source `youtube-intercept`):**
1. `youtube-main-world.ts` runs at `document_start` in the `MAIN` world on `*://www.youtube.com/*`.
   It wraps `window.fetch` and `XMLHttpRequest.prototype.open/send` and, for any URL containing
   `/api/timedtext`, clones/reads the response body and posts it to the isolated world
   (include `v` / `lang` / `kind` query params; `kind=asr` = auto-generated).
2. MUST NOT fetch caption `baseUrl`s itself (YouTube requires a `pot` token now; direct fetches
   return empty). Only reuse responses the player itself requested.
3. Parse json3: `events[]` with `tStartMs`, `dDurationMs`, `segs[].utf8`. Skip events without
   `segs` and segments that are only `"\n"`.
4. `mergeCues`: auto-generated (ASR) captions arrive as word fragments/rolling lines. Merge into
   sentence-like cues: join consecutive fragments; break at `.?!` sentence ends, at gaps > 1.2 s,
   or when the cue exceeds 7 s / 120 chars. Each merged cue's end = min(next cue start, own end).
   Manual captions are kept as-is (only normalized).
5. If captions are not enabled, try to enable English captions through the player element
   (`#movie_player` has `getOption/setOption/loadModule` methods in the MAIN world). Wrap in
   try/catch; if it fails, status = `no-subtitles` with a hint "Turn on CC (English)".
   Prefer manual English track over ASR when both exist.

**Fallback — DOM (source `youtube-dom`):** If no timedtext response arrives within 4 s after
captions are visible, observe `.ytp-caption-window-container` with a MutationObserver, read the
visible `.ytp-caption-segment` text, debounce **350 ms** (rolling captions change word by word),
translate the stabilized text (cache by text) and render it. In this mode there is no cue list, so
`sync.ts` is bypassed and the overlay shows the latest translation while the native caption is
visible.

**YouTube specifics:**
- SPA navigation: listen to `yt-navigate-finish` (and `popstate` as a backup); fully reset state
  per video (`videoId` from URL `v` param).
- Ads: when `#movie_player` has class `ad-showing`, hide the overlay.
- `hideOriginal`: inject a style `.ytp-caption-window-container { opacity: 0 !important; }` (keep
  them in DOM — the DOM fallback still needs to read them).
- Overlay is mounted inside `#movie_player` so it follows theater/fullscreen/miniplayer modes.

### 5.2 Generic HTML5 adapter (source `html5`)
- Find `<video>` elements (also those added later — MutationObserver on `document`). Pick the
  largest visible one that is playing or has been played.
- From `video.textTracks`, choose a track with `kind` `subtitles`/`captions`, preferring
  `language` starting with `en`, otherwise the first one.
- Set chosen track `mode = 'hidden'` (cues load but the browser doesn't render them). If
  `hideOriginal` is false, keep `showing` and render our overlay above it.
- Read `track.cues` once loaded (listen to `load` on the `<track>` element / poll up to 5 s). If
  cues are `null` (cross-origin without CORS) → status `no-subtitles` with detail.
- Convert `VTTCue` → `Cue` (strip tags like `<i>`, `<b>`, `<c.x>`, normalize whitespace).
  Also handle `addtrack` and `cuechange` for tracks that load cues lazily (re-read and translate
  new cues).
- Overlay: positioned over the video via `getBoundingClientRect()` + `ResizeObserver` + scroll
  listener; when `document.fullscreenElement` changes, re-mount the overlay inside the fullscreen
  element.
- Do nothing on youtube.com (YouTube adapter owns it).

---

## 6. Overlay & sync
- Overlay host element + **Shadow DOM** (styles isolated from the page). `pointer-events: none`.
- Centered text, max-width 80 % of video width, text shadow for readability, background box
  `rgba(0,0,0,bgOpacity)`, rounded corners, font `system-ui`.
- Mode `tr`: Turkish line only. Mode `tr+en`: Turkish line (fontSize) + English line below
  (0.75 × fontSize, slightly dimmer).
- If the translation for the active cue isn't ready yet: show the English text dimmed/italic.
- `sync.ts`: `requestAnimationFrame` loop **only while the video is playing** (start on `play`,
  stop on `pause`/`ended`), plus one update on `seeked`. Find active cue with binary search; only
  touch the DOM when the active cue changes.
- Settings changes apply live without reload.

---

## 7. Popup UI
- Width 320 px, clean modern look, light/dark via `prefers-color-scheme`.
- Header: icon + "Yerdema Subs" + version.
- Master on/off toggle (`enabled`).
- Status line for the active tab (from `GET_STATUS`; if no content script responds → "This page
  isn't supported"). Show a human-friendly message per status, localized.
- Controls: mode (TR / TR+EN segmented control), font size slider, position slider, background
  opacity slider, "hide original subtitles" checkbox.
- Live preview box showing a sample subtitle with current settings.
- Footer: small privacy note: "Subtitle text is sent to Google Translate for translation."
  + keyboard shortcut hint.
- All strings via `chrome.i18n` (`_locales/en`, `_locales/tr`; `default_locale: "en"`).
  Extension name/description localized too.

## 8. Keyboard shortcut
`commands`: `toggle-subs` with suggested key **Alt+Shift+T** → toggles `enabled`.

## 9. Manifest (MV3) requirements
- `permissions`: `storage`, `activeTab` (only if actually needed — prefer not).
- `host_permissions`: `https://translate.googleapis.com/*`.
- Content scripts:
  - `youtube-main-world.js`: matches `*://www.youtube.com/*`, `run_at: document_start`,
    `world: "MAIN"`.
  - `content.js`: matches `<all_urls>`, `all_frames: true`, `run_at: document_idle`.
- Background: `service_worker`, `type: module`.
- Icons 16/32/48/128, action popup, `_locales`, `minimum_chrome_version: "111"`.
- No remote code, no `eval`, CSP default.

## 10. Test page
`test-page/index.html` with an HTML5 `<video>` using the CC0 sample video
`https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4` and a local
`<track kind="subtitles" srclang="en" src="sample.en.vtt" default>`. `sample.en.vtt` contains
~8 English cues spread over the video length (the clip is short, ~5 s; loop it, or use more
cues with short durations). Served by `npm run serve:test` (a tiny Node static server, no
dependency) — tracks don't load over `file://`.

## 11. Tests (Vitest) — minimum set
- `youtube-json3`: parses a manual-caption fixture and an ASR fixture (write realistic fixtures
  by hand following the json3 shape); `mergeCues` produces sentence cues within limits.
- `cues`: `findActiveCue` edge cases (before first, between cues, exact boundaries, after last).
- `batching`: respects 4000-char / 40-item limits; never splits a single text.
- `google`: URL building, response parsing (captured fixture), alignment success and mismatch.
- `cache`: LRU eviction; persisted cache keeps 30 most recent.
- `html5` text cleanup: tags stripped, whitespace normalized.
- `settings`: defaults and clamping of out-of-range values.

## 12. Deliverables / Definition of Done
1. `npm run typecheck`, `npm test`, `npm run build`, `npm run package` all succeed.
2. `dist/manifest.json` is valid MV3, every file it references exists in `dist/`, content
   script bundles contain no top-level `import`/`export`.
3. `README.md` (English) + `README.tr.md` (Turkish): what it does, limitations (needs existing
   subtitles), install via "Load unpacked" for Chrome and Edge, dev commands, privacy note,
   project structure.
4. `MANUAL_TEST.md`: step-by-step checklist the user follows in the morning (test page, a YouTube
   video with manual EN captions, a YouTube video with auto-generated captions, SPA navigation,
   fullscreen, settings, shortcut, Edge).
5. `DECISIONS.md`: every assumption/decision taken autonomously.
6. `TASKS.md` fully checked, git history with one commit per completed phase (at least).

## 13. Stretch goals (only after DoD is complete, in this order)
1. Playwright E2E: launch Chromium with the unpacked extension, open the test page, assert the
   overlay shows non-empty text that differs from the English cue (translation mocked or real).
2. Per-site disable list in the popup ("Disable on this site").
3. "Copy current subtitle" button in the popup (TR + EN).
