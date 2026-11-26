// Runs the STT spike page in a headed Chromium (real GPU) and prints a summary.
// Usage: node spike/stt/run.mjs [profileDir] ["id|device|dtype,..."]
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const profile = process.argv[2] || path.join(dir, '.profile');
const models = process.argv[3] || [
  'onnx-community/moonshine-tiny-ONNX|webgpu|mixed',
  'onnx-community/moonshine-base-ONNX|webgpu|mixed',
  'onnx-community/whisper-base.en|webgpu|mixed',
  'onnx-community/whisper-small.en|webgpu|mixed',
  'onnx-community/moonshine-base-ONNX|wasm|q8',
].join(',');

const html = await readFile(path.join(dir, 'index.html'));
const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(5180, r));

const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: false,
  viewport: { width: 900, height: 600 },
  args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('console', (m) => { if (m.text().startsWith('[spike]')) console.log(m.text().slice(0, 300)); });
const done = new Promise((resolve) => page.exposeFunction('__done', resolve));
await page.goto(`http://localhost:5180/?models=${encodeURIComponent(models)}`);
const result = await done;
await writeFile(path.join(dir, 'results.json'), JSON.stringify(result, null, 2));
await ctx.close();
server.close();
console.log('\nwritten spike/stt/results.json');
