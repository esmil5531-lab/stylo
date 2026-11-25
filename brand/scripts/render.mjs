// STYLO — renders brand/**/*.svg to PNG and installs the app icons, splash and favicons.
//   node brand/scripts/render.mjs          (after: python brand/scripts/build_logo.py)
// Uses sharp from api/node_modules (already a dependency of the API).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..');
const sharp = createRequire(join(REPO, 'api', 'package.json'))('sharp');

const png = async (svg, out, width, opts = {}) => {
  mkdirSync(dirname(out), { recursive: true });
  let img = sharp(svg, { density: 384 }).resize({ width });
  if (opts.flatten) img = img.flatten({ background: opts.flatten });
  await img.png({ compressionLevel: 9 }).toFile(out);
  console.log('png', out.replace(REPO + '/', ''), width);
};

// 1. Every logo at 1× (1000 px wide) and 2× for print/web.
for (const f of readdirSync(join(ROOT, 'logo')).filter((n) => n.endsWith('.svg'))) {
  const base = join(ROOT, 'logo', 'png', f.replace('.svg', ''));
  await png(join(ROOT, 'logo', f), `${base}.png`, 1000);
  await png(join(ROOT, 'logo', f), `${base}@2x.png`, 2000);
}

// 2. App icons (Expo / EAS: 1024 × 1024 PNG; iOS icon must be opaque — it has a full background).
const icons = join(ROOT, 'icons');
await png(join(icons, 'app-icon.svg'), join(icons, 'png', 'app-icon-1024.png'), 1024);
await png(join(icons, 'app-icon-light.svg'), join(icons, 'png', 'app-icon-light-1024.png'), 1024);
await png(join(icons, 'android-foreground.svg'), join(icons, 'png', 'android-foreground-1024.png'), 1024);
await png(join(icons, 'android-background.svg'), join(icons, 'png', 'android-background-1024.png'), 1024);
await png(join(icons, 'android-monochrome.svg'), join(icons, 'png', 'android-monochrome-1024.png'), 1024);
for (const s of [16, 32, 48, 180, 192, 196, 512]) {
  await png(join(icons, 'favicon.svg'), join(icons, 'png', `favicon-${s}.png`), s);
}

// 3. Splash image (centred on navy by expo-splash-screen).
await png(join(ROOT, 'splash', 'splash.svg'), join(ROOT, 'splash', 'splash-1024.png'), 1024);

// 4. Install into the apps.
const install = (from, to) => {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log('install', to.replace(REPO + '/', ''));
};
const assets = join(REPO, 'mobile', 'assets');
install(join(icons, 'png', 'app-icon-1024.png'), join(assets, 'icon.png'));
install(join(icons, 'png', 'android-foreground-1024.png'), join(assets, 'android-icon-foreground.png'));
install(join(icons, 'png', 'android-background-1024.png'), join(assets, 'android-icon-background.png'));
install(join(icons, 'png', 'android-monochrome-1024.png'), join(assets, 'android-icon-monochrome.png'));
install(join(icons, 'png', 'favicon-196.png'), join(assets, 'favicon.png'));
install(join(ROOT, 'splash', 'splash-1024.png'), join(assets, 'splash-icon.png'));
install(join(icons, 'favicon.svg'), join(REPO, 'admin', 'public', 'favicon.svg'));
install(join(icons, 'png', 'favicon-180.png'), join(REPO, 'admin', 'public', 'apple-touch-icon.png'));

// 5. Artwork used inside the app (onboarding, hero without a photo, login).
const appBrand = join(assets, 'brand');
for (const [from, to] of [
  [join(ROOT, 'textures', 'navy-fabric-portrait.jpg'), 'navy-fabric-portrait.jpg'],
  [join(ROOT, 'textures', 'navy-fabric-wide.jpg'), 'navy-fabric-wide.jpg'],
  [join(ROOT, 'logo', 'png', 'stylo-logo-reversed-transparent.png'), 'logo-reversed.png'],
  [join(ROOT, 'logo', 'png', 'stylo-logo-primary.png'), 'logo-primary.png'],
  [join(ROOT, 'logo', 'png', 'stylo-mark-silver.png'), 'mark-silver.png'],
  [join(ROOT, 'logo', 'png', 'stylo-mark-navy.png'), 'mark-navy.png'],
]) {
  install(from, join(appBrand, to));
}

// 6. Back office (STYLO Admin / STYLO Store): logo + fabric, served from admin/public/brand/.
const adminBrand = join(REPO, 'admin', 'public', 'brand');
for (const [from, to] of [
  [join(ROOT, 'logo', 'stylo-logo-horizontal-reversed.svg'), 'logo-horizontal-reversed.svg'],
  [join(ROOT, 'logo', 'stylo-logo-horizontal.svg'), 'logo-horizontal.svg'],
  [join(ROOT, 'logo', 'stylo-logo-primary.svg'), 'logo-primary.svg'],
  [join(ROOT, 'logo', 'stylo-mark-silver.svg'), 'mark-silver.svg'],
  [join(ROOT, 'textures', 'navy-fabric-wide.jpg'), 'navy-fabric-wide.jpg'],
]) {
  install(from, join(adminBrand, to));
}
