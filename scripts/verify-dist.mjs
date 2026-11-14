// Validates dist/: manifest is MV3, every referenced file exists, content bundles are
// self-contained (no top-level import/export), manifest __MSG_*__ keys exist in all locales.
import { readFile, access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const errors = [];

async function exists(rel) {
  try {
    await access(path.join(dist, rel));
    return true;
  } catch {
    return false;
  }
}

async function requireFile(rel, why) {
  if (!(await exists(rel))) errors.push(`Missing file referenced by ${why}: ${rel}`);
}

const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
if (!/^\d+(\.\d+){0,3}$/.test(String(manifest.version))) errors.push(`invalid version: ${manifest.version}`);
for (const key of ['name', 'version', 'default_locale']) {
  if (!manifest[key]) errors.push(`manifest.${key} missing`);
}

for (const [size, file] of Object.entries(manifest.icons ?? {})) await requireFile(file, `icons.${size}`);
for (const [size, file] of Object.entries(manifest.action?.default_icon ?? {})) {
  await requireFile(file, `action.default_icon.${size}`);
}
if (manifest.action?.default_popup) await requireFile(manifest.action.default_popup, 'action.default_popup');
if (manifest.background?.service_worker) {
  await requireFile(manifest.background.service_worker, 'background.service_worker');
}

const contentFiles = [];
for (const cs of manifest.content_scripts ?? []) {
  for (const js of cs.js ?? []) {
    await requireFile(js, 'content_scripts.js');
    contentFiles.push(js);
  }
  for (const css of cs.css ?? []) await requireFile(css, 'content_scripts.css');
}

const moduleSyntax = /^\s*(import\s*[\w{*'"]|export\s)/m;
for (const js of contentFiles) {
  if (!(await exists(js))) continue;
  const code = await readFile(path.join(dist, js), 'utf8');
  if (moduleSyntax.test(code)) errors.push(`Content script ${js} contains top-level import/export`);
}

// No eval / remote code anywhere in JS output.
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
for (const file of await walk(dist)) {
  if (!file.endsWith('.js')) continue;
  const code = await readFile(file, 'utf8');
  if (/\beval\s*\(|new Function\s*\(/.test(code)) {
    errors.push(`${path.relative(dist, file)} uses eval/new Function`);
  }
}

// Popup HTML must reference only existing local files.
if (manifest.action?.default_popup && (await exists(manifest.action.default_popup))) {
  const htmlPath = manifest.action.default_popup;
  const html = await readFile(path.join(dist, htmlPath), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^https?:/.test(ref)) {
      errors.push(`Popup references remote resource: ${ref}`);
      continue;
    }
    if (/^(data:|#)/.test(ref)) continue;
    const rel = path.posix.join(path.posix.dirname(htmlPath), ref);
    await requireFile(rel, `popup HTML (${ref})`);
  }
}

// Locales
const msgKeys = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]);
for (const loc of ['en', 'tr']) {
  const rel = `_locales/${loc}/messages.json`;
  if (!(await exists(rel))) {
    errors.push(`Missing locale file ${rel}`);
    continue;
  }
  const messages = JSON.parse(await readFile(path.join(dist, rel), 'utf8'));
  for (const k of msgKeys) if (!messages[k]) errors.push(`Locale ${loc} missing message ${k}`);
}

if (errors.length) {
  console.error('verify-dist FAILED:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`verify-dist OK (${contentFiles.length} content scripts checked)`);
