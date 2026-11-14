// E2E: loads the unpacked extension (dist/) into Chromium, opens the HTML5 test page and checks
// that the overlay shows a Turkish line that differs from the English cue.
// Run `npm run build` first. Translation is mocked by default; set E2E_REAL_TRANSLATE=1 to hit
// the real Google endpoints.
import { test, expect, chromium, type BrowserContext, type Route } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const realTranslate = process.env.E2E_REAL_TRANSLATE === '1';

const ENGLISH_CUES = [
  'Hello and welcome!',
  'This flower is beautiful.',
  'The bees love it too.',
  'Look at the colors.',
  'Spring is finally here.',
  "Nature is amazing, isn't it?",
  'Thank you for watching.',
  'See you next time!',
];

let context: BrowserContext;
let translateRequests = 0;

async function fulfillGoogle(route: Route): Promise<void> {
  translateRequests++;
  const q = new URL(route.request().url()).searchParams.get('q') ?? '';
  const lines = q.split('\n');
  const segs = lines.map((line, i) => [`[TR] ${line}${i < lines.length - 1 ? '\n' : ''}`, line, null, null, 10]);
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify([segs, null, 'en']),
  });
}

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  if (!realTranslate) {
    await context.route('https://translate.googleapis.com/**', fulfillGoogle);
    await context.route('https://clients5.google.com/**', fulfillGoogle);
  }
});

test.afterAll(async () => {
  await context?.close();
});

test('extension service worker starts with a valid manifest', async () => {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  expect(worker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.version).toBe('0.1.0');
});

test('test page: overlay shows a translated subtitle', async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5173/');
  await page.evaluate(async () => {
    const v = document.querySelector('video')!;
    v.muted = true;
    await v.play();
  });

  const tr = page.locator('yerdema-subs-overlay .tr');
  await expect(tr).toBeVisible({ timeout: 20_000 });
  // Wait until a translated (non-pending) line is shown.
  await expect(page.locator('yerdema-subs-overlay .tr:not(.pending)')).toBeVisible({ timeout: 20_000 });
  const text = (await page.locator('yerdema-subs-overlay .tr:not(.pending)').textContent())?.trim() ?? '';
  expect(text).not.toBe('');
  expect(ENGLISH_CUES).not.toContain(text);
  if (!realTranslate) {
    expect(text.startsWith('[TR] ')).toBe(true);
    expect(translateRequests).toBeGreaterThan(0);
  }

  // Native track is hidden (hideOriginal default) and the overlay sits over the video.
  const mode = await page.evaluate(() => document.querySelector('video')!.textTracks[0]!.mode);
  expect(mode).toBe('hidden');
  const [videoBox, overlayBox] = await Promise.all([
    page.locator('video').boundingBox(),
    page.locator('yerdema-subs-overlay').boundingBox(),
  ]);
  expect(videoBox && overlayBox).toBeTruthy();
  expect(Math.abs(videoBox!.x - overlayBox!.x)).toBeLessThan(2);
  expect(Math.abs(videoBox!.width - overlayBox!.width)).toBeLessThan(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.join(root, 'test-results', 'test-page.png') });
});

test('popup renders and reports status for the active tab', async () => {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 320, height: 640 });
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await expect(popup.locator('.name')).toHaveText('Yerdema Subs');
  await expect(popup.locator('#version')).toHaveText('v0.1.0');
  await expect(popup.locator('#enabled')).toBeChecked();
  // The popup itself is the active tab here → no content script → "not supported".
  await expect(popup.locator('#status')).toHaveAttribute('data-state', 'unsupported');
  // Mode switch updates the preview (EN line visible only in TR+EN).
  await expect(popup.locator('.preview-en')).toBeHidden();
  await popup.locator('button[data-mode="tr+en"]').click();
  await expect(popup.locator('.preview-en')).toBeVisible();
  await popup.screenshot({ path: path.join(root, 'test-results', 'popup.png'), fullPage: true });
  await popup.locator('button[data-mode="tr"]').click();
  await popup.close();
});

test('toggling enabled off removes the overlay text live', async () => {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.goto('http://localhost:5173/');
  await page.evaluate(async () => {
    const v = document.querySelector('video')!;
    v.muted = true;
    await v.play();
  });
  await expect(page.locator('yerdema-subs-overlay .tr:not(.pending)')).toBeVisible({ timeout: 20_000 });
  await worker.evaluate(async () => {
    const data = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(data.settings ?? {}), enabled: false } });
  });
  await expect(page.locator('yerdema-subs-overlay')).toHaveCount(0, { timeout: 5_000 });
  await worker.evaluate(async () => {
    const data = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(data.settings ?? {}), enabled: true } });
  });
  await expect(page.locator('yerdema-subs-overlay .tr:not(.pending)')).toBeVisible({ timeout: 20_000 });
});
