// STYLO — turns brand/tokens.json (the single source) into code for every app:
//   mobile/src/theme/tokens.ts   (React Native, imported by mobile/src/theme/index.ts)
//   admin/src/tokens.css         (CSS custom properties --stylo-*, used by admin/src/styles.css)
// Run after editing tokens.json:  node brand/scripts/build-tokens.mjs   (or npm run brand:tokens)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(BRAND, '..');
const t = JSON.parse(readFileSync(join(BRAND, 'tokens.json'), 'utf8'));

const values = (group) =>
  Object.fromEntries(Object.entries(group).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, v.$value ?? v]));

const color = values(t.color);
const banner = '// GENERATED from brand/tokens.json by brand/scripts/build-tokens.mjs — do not edit by hand.\n';

// ---------------------------------------------------------------- React Native
const strip = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, typeof v === 'object' ? strip(v) : v]));
const ts =
  banner +
  `export const tokens = ${JSON.stringify(
    { color, space: strip(t.space), radius: strip(t.radius), type: strip(t.type), motion: strip(t.motion) },
    null,
    2,
  )} as const;\n`;
writeFileSync(join(REPO, 'mobile/src/theme/tokens.ts'), ts.replace(/"([A-Za-z_$][\w$]*)":/g, '$1:').replace(/"/g, "'"));

// ---------------------------------------------------------------- CSS
const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const lines = [
  ...Object.entries(color).map(([k, v]) => `  --stylo-${kebab(k)}: ${v};`),
  ...Object.entries(strip(t.radius)).map(([k, v]) => `  --stylo-radius-${k}: ${v}px;`),
  ...Object.entries(strip(t.space)).map(([k, v]) => `  --stylo-space-${k}: ${v}px;`),
  `  --stylo-shadow-card: ${t.shadow.card.$value};`,
  `  --stylo-shadow-sheet: ${t.shadow.sheet.$value};`,
  `  --stylo-font-body: '${t.font.body.$value}', system-ui, sans-serif;`,
  `  --stylo-font-display: '${t.font.display.$value}', Georgia, serif;`,
  `  --stylo-font-display-en: '${t.font.displayEn.$value}', Georgia, serif;`,
  `  --stylo-font-label: '${t.font.label.$value}', system-ui, sans-serif;`,
  `  --stylo-ease: ${t.motion.easing};`,
];
writeFileSync(join(REPO, 'admin/src/tokens.css'), `/* ${banner.slice(3).trim()} */\n:root {\n${lines.join('\n')}\n}\n`);
console.log('tokens → mobile/src/theme/tokens.ts, admin/src/tokens.css');
