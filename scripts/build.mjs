// Builds the extension into dist/ using programmatic Vite builds.
// - popup: regular Vite HTML build (lands at dist/popup/index.html)
// - background: single-file ES module
// - content scripts: self-contained IIFE bundles (MV3 content scripts are not modules)
// - offscreen: live transcription page + STT worker (transformers.js, ONNX Runtime WASM in ort/)
import { build } from 'vite';
import { rimraf } from 'rimraf';
import { cp, readFile, writeFile, mkdir, access, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const r = (...p) => path.join(root, ...p);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function buildScript(entry, fileName, format) {
  await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      outDir: dist,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'chrome116',
      lib: {
        entry: r(entry),
        formats: [format],
        name: 'YerdemaSubs',
        fileName: () => fileName,
      },
    },
  });
}

async function main() {
  await rimraf(dist);
  await mkdir(dist, { recursive: true });

  await build({
    configFile: false,
    logLevel: 'warn',
    root: r('src/popup'),
    base: './',
    publicDir: false,
    build: {
      outDir: path.join(dist, 'popup'),
      emptyOutDir: false,
      minify: false,
      target: 'chrome116',
      modulePreload: false,
    },
  });

  // Offscreen document (live transcription) + its STT worker; bundles transformers.js.
  await build({
    configFile: false,
    logLevel: 'warn',
    root: r('src/offscreen'),
    base: './',
    publicDir: false,
    worker: { format: 'es' },
    build: {
      outDir: path.join(dist, 'offscreen'),
      emptyOutDir: false,
      minify: true,
      target: 'chrome116',
      modulePreload: false,
      chunkSizeWarningLimit: 4096,
    },
  });
  // Vite copies ONNX Runtime's default .wasm next to the worker; we load it from ort/ instead.
  for (const f of await readdir(path.join(dist, 'offscreen/assets'))) {
    if (f.endsWith('.wasm')) await rm(path.join(dist, 'offscreen/assets', f));
  }
  // ONNX Runtime WASM backend used by transformers.js (asyncify build supports WebGPU + CPU).
  await mkdir(path.join(dist, 'ort'), { recursive: true });
  for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
    await cp(r('node_modules/onnxruntime-web/dist', f), path.join(dist, 'ort', f));
  }

  await buildScript('src/background/index.ts', 'background.js', 'es');
  await buildScript('src/content/main.ts', 'content.js', 'iife');
  await buildScript('src/content/youtube-main-world.ts', 'youtube-main-world.js', 'iife');

  const pkg = JSON.parse(await readFile(r('package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(r('src/manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  await cp(r('_locales'), path.join(dist, '_locales'), { recursive: true });
  if (await exists(r('public/icons'))) {
    await cp(r('public/icons'), path.join(dist, 'icons'), { recursive: true });
  }
  console.log('Build complete -> dist/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
