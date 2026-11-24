#!/usr/bin/env node
/**
 * Runs after `expo export --platform web` (see `npm run build:customer` at the repo root).
 *
 * Every exported page must load the JavaScript bundle, or the browser shows an empty white page
 * with no error. Some machines (seen on Windows) export pages without their <script> tags while
 * the bundle files exist. This checks every .html file and, where the tags are missing, adds the
 * synchronous bundle files in the order Expo uses:
 *   __expo-metro-runtime-*.js → __common-*.js → entry-*.js
 * (route chunks of a split build are then loaded on demand by the runtime).
 *
 * Usage: node scripts/fix-web-export.mjs [distDir]   (default: ./dist)
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const jsDir = join(dist, '_expo', 'static', 'js', 'web');
const BUNDLE_SRC = /<script[^>]+src="\/?_expo\/static\/js\/web\/[^"]+\.js"/;

function newest(prefix) {
  const files = readdirSync(jsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.js'))
    .map((f) => ({ f, t: statSync(join(jsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0]?.f;
}

if (!existsSync(join(dist, 'index.html')) || !existsSync(jsDir)) {
  console.error(`✗ ${dist}: no index.html or no _expo/static/js/web — the web export failed.`);
  process.exit(1);
}
const entry = newest('entry-');
if (!entry) {
  console.error('✗ no entry-*.js bundle in _expo/static/js/web — the web export is incomplete.');
  process.exit(1);
}
const scripts = [newest('__expo-metro-runtime-'), newest('__common-'), entry]
  .filter(Boolean)
  .map((f) => `<script src="/_expo/static/js/web/${f}" defer></script>`)
  .join('');

const pages = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '_expo' && name !== 'assets') walk(full);
    } else if (name.endsWith('.html')) pages.push(full);
  }
};
walk(dist);

let fixed = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  if (BUNDLE_SRC.test(html)) continue;
  const out = html.includes('</body>') ? html.replace('</body>', `${scripts}</body>`) : html + scripts;
  writeFileSync(page, out);
  fixed++;
}

const index = readFileSync(join(dist, 'index.html'), 'utf8');
console.log(
  fixed
    ? `✓ web export: added the bundle <script> tags to ${fixed} of ${pages.length} pages (they were missing)`
    : `✓ web export: ${pages.length} pages load the bundle`,
);
console.log(`  index.html ${Buffer.byteLength(index)} bytes · ${relative(dist, jsDir).split(sep).join('/')}/${entry}`);
