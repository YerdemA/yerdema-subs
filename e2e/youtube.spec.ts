// Optional smoke test against real YouTube (network, consent walls and ads make it
// non-deterministic). Run with: E2E_YOUTUBE=1 npx playwright test e2e/youtube.spec.ts
// Google Translate is mocked; YouTube itself is real.
import { test, expect, chromium, type BrowserContext, type Route } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
// A TED talk with manual English captions.
const VIDEO_ID = process.env.E2E_YOUTUBE_VIDEO ?? 'iG9CE55wbtY';

test.skip(process.env.E2E_YOUTUBE !== '1', 'set E2E_YOUTUBE=1 to run the real YouTube smoke test');

let context: BrowserContext;

async function fulfillGoogle(route: Route): Promise<void> {
  const q = new URL(route.request().url()).searchParams.get('q') ?? '';
  const lines = q.split('\n');
  const segs = lines.map((line, i) => [`[TR] ${line}${i < lines.length - 1 ? '\n' : ''}`, line, null, null, 10]);
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([segs, null, 'en']) });
}

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: process.env.E2E_HEADED !== '1',
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  await context.route('https://translate.googleapis.com/**', fulfillGoogle);
  await context.route('https://clients5.google.com/**', fulfillGoogle);
  // Record the extension's page messages (MAIN ↔ isolated) for diagnostics.
  await context.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __ysLog: string[] }).__ysLog = log;
    window.addEventListener('message', (e: MessageEvent<unknown>) => {
      const d = e.data as { source?: string; type?: string; lang?: string; kind?: string; ok?: boolean; detail?: string };
      if (d && d.source === 'yerdema-subs') {
        log.push(`${d.type}:${d.lang ?? ''}:${d.kind ?? ''}:${d.ok ?? ''}:${d.detail ?? ''}`);
      }
    });
  });
});

test.afterAll(async () => {
  await context?.close();
});

test('YouTube watch page: overlay inside #movie_player shows a translated caption', async () => {
  test.setTimeout(120_000);
  const page = await context.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { waitUntil: 'domcontentloaded' });

  // Best effort: dismiss a consent dialog if one shows up.
  const consent = page.locator('button:has-text("Accept all"), button:has-text("Reject all")').first();
  if (await consent.isVisible({ timeout: 5_000 }).catch(() => false)) await consent.click();

  await page.waitForSelector('#movie_player video', { timeout: 30_000 });
  await page.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>('#movie_player video');
    if (v) {
      v.muted = true;
      await v.play().catch(() => undefined);
    }
  });

  const translated = page.locator('#movie_player yerdema-subs-overlay .tr:not(.pending)');
  try {
    await expect(translated).toBeVisible({ timeout: 60_000 });
  } finally {
    const log = await page.evaluate(() => (window as unknown as { __ysLog?: string[] }).__ysLog ?? []);
    console.log('extension page messages:', JSON.stringify(log.slice(0, 20)));
    await page.screenshot({ path: path.join(root, 'test-results', 'youtube.png') });
  }
  const text = (await translated.textContent())?.trim() ?? '';
  console.log('overlay text:', text);
  expect(text.startsWith('[TR] ')).toBe(true);
});
