// E2E for live translation (tab audio → local STT → translation → floating overlay).
// Heavy: downloads the ~154 MB speech model on first run (cached in .cache/live-profile)
// and needs real audio + preferably a GPU, so it only runs with E2E_LIVE=1 (headed by default;
// E2E_LIVE_HEADLESS=1 to try headless/WASM).
//   E2E_LIVE=1 npx playwright test e2e/live.spec.ts
import { test, expect, chromium, type BrowserContext, type Route, type Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
// Outside test-results/ (Playwright wipes it each run) so the model stays cached.
const profile = path.join(root, '.cache', 'live-profile');
const enabled = process.env.E2E_LIVE === '1';
const headless = process.env.E2E_LIVE_HEADLESS === '1';
const realTranslate = process.env.E2E_REAL_TRANSLATE === '1';

test.skip(!enabled, 'set E2E_LIVE=1 to run the live translation test');
test.setTimeout(600_000);

async function fulfillGoogle(route: Route): Promise<void> {
  const q = new URL(route.request().url()).searchParams.get('q') ?? '';
  const lines = q.split('\n');
  const segs = lines.map((line, i) => [`[TR] ${line}${i < lines.length - 1 ? '\n' : ''}`, line, null, null, 10]);
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([segs, null, 'en']) });
}

async function launch(extraArgs: string[] = []): Promise<{ context: BrowserContext; worker: Worker }> {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      '--autoplay-policy=no-user-gesture-required',
      ...extraArgs,
    ],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  return { context, worker };
}

test('live translation shows Turkish captions for speech without subtitles', async () => {
  // First launch only to learn the (path-derived) extension id; tab capture without a popup
  // click needs the id allowlisted.
  const first = await launch();
  const extensionId = new URL(first.worker.url()).host;
  await first.context.close();

  const { context, worker } = await launch([`--allowlisted-extension-id=${extensionId}`]);
  if (!realTranslate) {
    await context.route('https://translate.googleapis.com/**', fulfillGoogle);
    await context.route('https://clients5.google.com/**', fulfillGoogle);
  }
  try {
    const page = await context.newPage();
    const logs: string[] = [];
    page.on('console', (m) => logs.push(m.text()));
    await page.goto('http://localhost:5173/live.html');
    await page.evaluate(async () => {
      const a = document.getElementById('audio') as HTMLAudioElement;
      await a.play();
    });
    await page.bringToFront();

    await worker.evaluate(async () => {
      await (globalThis as unknown as { yerdemaToggleLive: () => Promise<void> }).yerdemaToggleLive();
    });

    // Wait for the model (first run downloads it) and report progress.
    const t0 = Date.now();
    let state: { phase?: string; progress?: number; device?: string; error?: string } = {};
    while (Date.now() - t0 < 540_000) {
      state = await worker.evaluate(async () => (await chrome.storage.session.get('liveState')).liveState ?? {});
      console.log(`  t+${Math.round((Date.now() - t0) / 1000)}s`, state.phase, state.progress ?? '');
      if (state.phase === 'listening' || state.phase === 'error') break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log('live state:', JSON.stringify(state), `after ${Math.round((Date.now() - t0) / 1000)} s`);
    expect(state.error ?? '').toBe('');
    expect(state.phase).toBe('listening');

    // Restart the talk so speech is captured from the beginning.
    await page.evaluate(() => {
      const a = document.getElementById('audio') as HTMLAudioElement;
      a.currentTime = 0;
    });
    const tr = page.locator('yerdema-subs-overlay .tr:not(.pending)');
    await expect(tr).toBeVisible({ timeout: 30_000 });
    const seen = new Set<string>();
    const until = Date.now() + 25_000;
    while (Date.now() < until) {
      const text = (await tr.textContent().catch(() => '')) ?? '';
      if (text.trim()) seen.add(text.trim());
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log('captions:\n' + [...seen].join('\n'));
    const all = [...seen].join(' ').toLowerCase();
    if (!realTranslate) {
      expect([...seen].every((s) => s.startsWith('[TR] '))).toBe(true);
      expect(all).toMatch(/college|government|papers/);
    } else {
      expect(all).toMatch(/üniversite|kolej|makale|devlet/);
    }
    // Floating bar (no <video> on the page), and the tab is still audible (not muted by capture).
    const host = page.locator('yerdema-subs-overlay');
    expect(await host.evaluate((el) => (el as HTMLElement).style.position)).toBe('fixed');
    await page.screenshot({ path: path.join(root, 'test-results', 'live.png') });

    await worker.evaluate(async () => {
      await (globalThis as unknown as { yerdemaToggleLive: () => Promise<void> }).yerdemaToggleLive();
    });
    await expect(page.locator('yerdema-subs-overlay .wrap')).toBeHidden({ timeout: 5_000 });
    const after = await worker.evaluate(async () => (await chrome.storage.session.get('liveState')).liveState);
    expect((after as { phase: string }).phase).toBe('off');
  } finally {
    await context.close();
  }
});
