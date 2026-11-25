import {
  mdiAccountTie,
  mdiBabyFaceOutline,
  mdiBagPersonal,
  mdiDiamondStone,
  mdiFaceWomanShimmer,
  mdiGift,
  mdiHairDryer,
  mdiHanger,
  mdiHatFedora,
  mdiHumanChild,
  mdiHumanFemale,
  mdiHumanFemaleGirl,
  mdiHumanMale,
  mdiHumanMaleBoy,
  mdiLipstick,
  mdiLotionOutline,
  mdiMirror,
  mdiNecklace,
  mdiPurse,
  mdiPurseOutline,
  mdiRing,
  mdiRun,
  mdiShoeBallet,
  mdiShoeFormal,
  mdiShoeHeel,
  mdiShoeSneaker,
  mdiSpray,
  mdiStarFourPoints,
  mdiSunglasses,
  mdiTshirtCrew,
  mdiTshirtV,
  mdiWallet,
  mdiWatch,
  mdiWatchVariant,
} from '@mdi/js';

/**
 * Icons a category tile can use — the same MaterialCommunityIcons the app draws
 * (api/src/lib/category-icons.ts holds the allowed names). Path data from @mdi/js for previews.
 */
export const CATEGORY_ICONS: { name: string; label: string; path: string }[] = [
  { name: 'hanger', label: 'علّاقة ملابس', path: mdiHanger },
  { name: 'human-female', label: 'امرأة', path: mdiHumanFemale },
  { name: 'human-male', label: 'رجل', path: mdiHumanMale },
  { name: 'human-child', label: 'طفل', path: mdiHumanChild },
  { name: 'human-female-girl', label: 'بنت', path: mdiHumanFemaleGirl },
  { name: 'human-male-boy', label: 'ولد', path: mdiHumanMaleBoy },
  { name: 'baby-face-outline', label: 'رضيع', path: mdiBabyFaceOutline },
  { name: 'tshirt-crew', label: 'تيشيرت', path: mdiTshirtCrew },
  { name: 'tshirt-v', label: 'بلوزة', path: mdiTshirtV },
  { name: 'account-tie', label: 'بدلة رسمية', path: mdiAccountTie },
  { name: 'run', label: 'رياضة', path: mdiRun },
  { name: 'purse', label: 'حقيبة يد', path: mdiPurse },
  { name: 'purse-outline', label: 'حقيبة كروس', path: mdiPurseOutline },
  { name: 'bag-personal', label: 'حقيبة ظهر', path: mdiBagPersonal },
  { name: 'wallet', label: 'محفظة', path: mdiWallet },
  { name: 'shoe-heel', label: 'كعب عالي', path: mdiShoeHeel },
  { name: 'shoe-sneaker', label: 'حذاء رياضي', path: mdiShoeSneaker },
  { name: 'shoe-ballet', label: 'حذاء مسطح', path: mdiShoeBallet },
  { name: 'shoe-formal', label: 'حذاء رجالي', path: mdiShoeFormal },
  { name: 'sunglasses', label: 'نظارة', path: mdiSunglasses },
  { name: 'necklace', label: 'قلادة', path: mdiNecklace },
  { name: 'diamond-stone', label: 'مجوهرات', path: mdiDiamondStone },
  { name: 'ring', label: 'خاتم', path: mdiRing },
  { name: 'hat-fedora', label: 'قبعة', path: mdiHatFedora },
  { name: 'watch', label: 'ساعة', path: mdiWatch },
  { name: 'watch-variant', label: 'ساعة نسائية', path: mdiWatchVariant },
  { name: 'lipstick', label: 'مكياج', path: mdiLipstick },
  { name: 'spray', label: 'عطر', path: mdiSpray },
  { name: 'lotion-outline', label: 'كريم وعناية', path: mdiLotionOutline },
  { name: 'hair-dryer', label: 'عناية بالشعر', path: mdiHairDryer },
  { name: 'face-woman-shimmer', label: 'جمال', path: mdiFaceWomanShimmer },
  { name: 'mirror', label: 'مرآة', path: mdiMirror },
  { name: 'gift', label: 'هدايا', path: mdiGift },
  { name: 'star-four-points', label: 'مميز', path: mdiStarFourPoints },
];

export const iconPath = (name: string | null | undefined) =>
  CATEGORY_ICONS.find((i) => i.name === name)?.path ?? mdiHanger;

/** Tile tints offered for categories (the app's palette). */
/** Tile tints in the STYLO palette (navy, teal, neutrals) — same values as migration 0013. */
export const CATEGORY_COLORS = ['#0B1F2E', '#13324A', '#355E5A', '#A79F8E', '#8A7A5C', '#7C8A8F', '#C9C4B8', '#5F6870'];

/** The app draws the tile in a light tint of the colour with a deeper icon (same maths as mobile/src/lib/color.ts). */
function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
export const tileBackground = (hex: string) => mix(hex, 255, 0.86);
export function tileIconColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.75 ? '#857F82' : lum > 0.35 ? mix(hex, 0, 0.45) : hex;
}
