// Zips dist/ into release/yerdema-subs-v<version>.zip (Chrome Web Store ready layout:
// manifest.json at the zip root).
import { zipSync } from 'fflate';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

async function collect(dir, base = '') {
  const files = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await collect(abs, rel));
    else files[rel] = new Uint8Array(await readFile(abs));
  }
  return files;
}

const files = await collect(dist);
if (!files['manifest.json']) {
  console.error('zip: dist/manifest.json not found, run npm run build first');
  process.exit(1);
}
const zipped = zipSync(files, { level: 9 });
const outDir = path.join(root, 'release');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `yerdema-subs-v${pkg.version}.zip`);
await writeFile(outFile, zipped);
console.log(`zip: wrote ${path.relative(root, outFile)} (${Object.keys(files).length} files, ${zipped.length} bytes)`);
