// Generates PNG icons (16, 32, 48, 128) from assets/icon.svg into public/icons/.
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'assets/icon.svg'));
const outDir = path.join(root, 'public/icons');
await mkdir(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: Math.max(72, (72 * size) / 32) })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon${size}.png`));
  console.log(`icons: wrote icon${size}.png`);
}
