# TASKS — Yerdema Subs v0.1.0

Rules: work top to bottom, check items off immediately, run quality gates at the end of each
phase, commit after each phase. See `CLAUDE.md`.

## Phase 0 — Setup
- [x] Verify `node -v` (≥ 20) and `git --version`; `git init` (initial commit with the spec files)
- [x] `package.json` (name `yerdema-subs`, version `0.1.0`, `"type": "module"`, private)
- [x] Install dev deps: typescript, vite, vitest, jsdom, @types/chrome, @types/node, sharp,
      a zip library (e.g. `archiver` or `fflate`), rimraf
- [x] `tsconfig.json` (strict, ES2022, DOM, `types: ["chrome", "vite/client"]`)
- [x] Build setup: Vite builds popup (HTML) + background (ES module); content scripts built
      separately as IIFE (Vite lib mode, one build per entry, via `scripts/build.mjs`);
      copy `manifest.json`, `_locales/`, `public/icons/` into `dist/`
- [x] npm scripts: typecheck, test, build, package, icons, serve:test
- [x] Vitest config (jsdom env for DOM tests)
- [x] Skeleton files for every module in SPEC §3 so the build passes end-to-end
- [x] Gates pass → commit `chore: project scaffold`

## Phase 1 — Shared core logic (+ unit tests)
- [x] `types.ts` (Cue, Settings, Status, message unions)
- [x] `settings.ts` (defaults, clamp, load/save/subscribe)
- [x] `cues.ts` (`normalizeText`, `stripTags`, `findActiveCue`)
- [x] Verify Google endpoint with `curl`; save fixture `src/shared/__fixtures__/google-sample.json`
- [x] `google.ts` (URL builder, parser, alignment)
- [x] `batching.ts` (4000 encoded chars / 40 items)
- [x] `youtube-json3.ts` (parser + `mergeCues`) with manual + ASR fixtures
- [x] `cache.ts` (LRU + persisted per-video helpers, 30 videos)
- [x] All SPEC §11 tests written and green → commit

## Phase 2 — Background service worker
- [x] `Translator` interface + `GoogleGtxTranslator`
- [x] Queue with max 2 concurrent batches, retry/backoff, item-by-item fallback on mismatch
- [x] Caches wired (memory + storage.local per videoKey)
- [x] `TRANSLATE` message handler (always responds, never throws)
- [x] `commands` handler for `toggle-subs`
- [x] Gates pass → commit

## Phase 3 — Overlay & sync
- [x] `overlay.ts` (Shadow DOM, modes, settings live update, pending-translation style)
- [x] Mounting strategies: inside a container (YouTube) / positioned over a video (generic,
      ResizeObserver + scroll + fullscreen re-mount)
- [x] `sync.ts` (rAF only while playing, seeked update, binary search, change-only DOM writes)
- [x] Translation prioritization (current position first, then rest) driven from content side
- [x] Gates pass → commit

## Phase 4 — Generic HTML5 adapter + test page
- [ ] `adapters/html5.ts` per SPEC §5.2 (track choice, hidden mode, cue load, CORS null case,
      addtrack/cuechange, fullscreen)
- [ ] `test-page/index.html` + `sample.en.vtt`, `scripts/serve.mjs` (no deps)
- [ ] `content/main.ts` adapter selection + `GET_STATUS` responder
- [ ] Gates pass → commit

## Phase 5 — YouTube adapter
- [ ] `youtube-main-world.ts` fetch + XHR interceptor for `/api/timedtext` → postMessage
- [ ] Isolated-side listener with origin/source checks; parse + merge; translate; render
- [ ] Try to enable English captions via `#movie_player` API (MAIN world, try/catch);
      prefer manual over ASR
- [ ] DOM fallback mode (`.ytp-caption-segment`, 350 ms debounce)
- [ ] SPA navigation reset (`yt-navigate-finish`, `popstate`), ad handling (`ad-showing`)
- [ ] `hideOriginal` style injection
- [ ] Gates pass → commit

## Phase 6 — Popup, i18n, shortcut
- [ ] `_locales/en/messages.json`, `_locales/tr/messages.json` (all UI + status strings,
      extension name/description)
- [ ] Popup UI per SPEC §7 (toggle, status, segmented mode, sliders, checkbox, live preview,
      privacy note, shortcut hint, dark mode)
- [ ] `commands` in manifest (Alt+Shift+T)
- [ ] Gates pass → commit

## Phase 7 — Assets, docs, packaging, final verification
- [ ] `assets/icon.svg` (simple: speech-bubble/subtitle bars + "TR"), `npm run icons` → PNGs
- [ ] `scripts/verify-dist.mjs`: validates manifest references exist & content bundles have no
      top-level import/export; run it as part of `npm run package`
- [ ] `npm run package` → `release/yerdema-subs-v0.1.0.zip`
- [ ] `README.md`, `README.tr.md`, `MANUAL_TEST.md` (Turkish), `DECISIONS.md` complete
- [ ] Full gates + package pass → commit `chore: release v0.1.0`

## Phase 8 — Stretch (only if all above is done)
- [ ] Playwright E2E on the test page with the unpacked extension
- [ ] Per-site disable list
- [ ] "Copy current subtitle" button

## Final report
- [ ] Write `REPORT.md` (Turkish): what was built, what works, known limitations, what to test
      manually first, any blocked items.
