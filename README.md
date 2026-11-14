# Yerdema Subs

A Chrome / Edge (Manifest V3) extension that reads the **English subtitles** of the video you are
watching, translates them to **Turkish** in real time and shows them as an overlay on top of the
video.

- **YouTube** (`youtube.com/watch`): uses the captions the YouTube player itself downloads
  (manual or auto-generated), merges auto-generated word fragments into sentences, and falls back
  to reading the on-screen captions if needed.
- **Any HTML5 video** with native subtitle tracks (`<track kind="subtitles|captions">`), including
  videos inside iframes.
- Display modes: Turkish only, or Turkish + English. Adjustable font size, position and
  background opacity. Option to hide the site's own subtitles.
- Popup in Turkish or English (follows the browser language), keyboard shortcut **Alt+Shift+T**
  to toggle.
- "Disable on this site" switch and a "Copy current subtitle" button (Turkish + English) in the
  popup.

## Limitations

- **It needs existing subtitles.** Videos without any subtitle track are not supported (no
  speech-to-text).
- Not supported: Netflix, Prime Video, Disney+, Twitch, live streams, YouTube Shorts, YouTube
  embeds on other sites, players that render captions as plain DOM text (other than YouTube),
  Firefox/Safari.
- Subtitle files served cross-origin without CORS can't be read by the browser (status:
  "no usable subtitles").
- If a site puts the `<video>` element itself into fullscreen (instead of a container), nothing
  can be drawn over it; most players fullscreen a container, which works.
- Translation uses the free, unofficial Google Translate endpoint. It can be rate limited
  (HTTP 429). The extension then tries a second Google endpoint, backs off and retries; while
  waiting, the English text is shown in italics.

## Install (Load unpacked)

1. `npm install` then `npm run build` (or use `release/yerdema-subs-v0.1.0.zip`, unzipped).
2. **Chrome:** open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and
   select the `dist/` folder.
3. **Edge:** open `edge://extensions`, enable **Developer mode**, click **Load unpacked** and
   select the `dist/` folder.
4. **Reload tabs that were already open** — content scripts are only injected into pages loaded
   after the extension was installed.
5. Pin the extension and open the popup on a video page.

If the shortcut is not assigned (another extension may use it), set it at
`chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

## Development

Requirements: Node 20+, npm. Works on Windows, macOS and Linux.

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit tests |
| `npm run build` | Builds the unpacked extension into `dist/` and validates it (`scripts/verify-dist.mjs`) |
| `npm run package` | Build + zip into `release/yerdema-subs-v<version>.zip` |
| `npm run icons` | Generates PNG icons from `assets/icon.svg` |
| `npm run serve:test` | Serves `test-page/` at http://localhost:5173 (`PORT` env to change) |
| `npm run test:e2e` | Build + Playwright E2E: loads `dist/` into Chromium and checks the overlay on the test page (first run: `npx playwright install chromium`; `E2E_REAL_TRANSLATE=1` to use real Google instead of a mock) |

The test page (`npm run serve:test`) contains a short looping HTML5 video with an English VTT
track — the quickest way to see the extension working.

## Privacy

Subtitle text is sent to Google Translate (`translate.googleapis.com`, fallback
`clients5.google.com`) for translation. Nothing else is collected or sent anywhere: no
analytics, no account, no server. Settings are stored in `chrome.storage.sync`; translations of
the 30 most recent videos are cached in `chrome.storage.local`. When the extension is switched
off, no text is sent.

## Project structure

```
src/
  manifest.json          MV3 manifest (version injected from package.json at build)
  shared/                pure, unit-tested logic
    types.ts             Cue, Settings, Status, message types + guards
    settings.ts          defaults, clamping, load/save/subscribe (storage.sync)
    cues.ts              text cleanup, findActiveCue (binary search), priority order
    youtube-json3.ts     YouTube json3 parsing, ASR fragment → sentence merging
    youtube.ts           YouTube URL/track helpers
    batching.ts          request batches (≤ 4000 encoded chars, ≤ 40 items)
    google.ts            Google URL builder, response parser, line alignment
    cache.ts             LRU + persisted per-video cache
    i18n.ts              chrome.i18n helpers
  background/
    index.ts             service worker: TRANSLATE handler, toggle command
    translator.ts        Translator interface + GoogleGtxTranslator (retry/backoff/fallback)
    service.ts           caches in front of the translator
  content/
    main.ts              entry: adapter selection, settings, GET_STATUS
    overlay.ts           Shadow-DOM overlay
    sync.ts              rAF sync (only while playing)
    cue-translator.ts    prioritized translation of the cue list
    cue-session.ts       video + cues + overlay + sync + translator
    youtube-main-world.ts  MAIN-world fetch/XHR interceptor for /api/timedtext
    adapters/youtube.ts  YouTube adapter (intercept + DOM fallback)
    adapters/html5.ts    generic textTracks adapter
  popup/                 popup UI (plain TS/HTML/CSS)
_locales/en, _locales/tr  UI strings
assets/icon.svg          icon source → public/icons/*.png
test-page/               HTML5 test page + sample.en.vtt
scripts/                 build, verify-dist, zip, icons, static server
e2e/                     Playwright end-to-end test
```

Design decisions taken during development are listed in `DECISIONS.md`.
