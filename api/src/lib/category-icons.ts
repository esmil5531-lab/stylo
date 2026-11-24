/**
 * Icons a category tile may use: MaterialCommunityIcons names that exist in the app
 * (@expo/vector-icons). Same list, with Arabic labels and previews, in
 * admin/src/lib/categoryIcons.ts. Add a name to both lists to offer a new icon.
 */
export const CATEGORY_ICONS = [
  'hanger',
  'human-female',
  'human-male',
  'human-child',
  'human-female-girl',
  'human-male-boy',
  'baby-face-outline',
  'tshirt-crew',
  'tshirt-v',
  'account-tie',
  'run',
  'purse',
  'purse-outline',
  'bag-personal',
  'wallet',
  'shoe-heel',
  'shoe-sneaker',
  'shoe-ballet',
  'shoe-formal',
  'sunglasses',
  'necklace',
  'diamond-stone',
  'ring',
  'hat-fedora',
  'watch',
  'watch-variant',
  'lipstick',
  'spray',
  'lotion-outline',
  'hair-dryer',
  'face-woman-shimmer',
  'mirror',
  'gift',
  'star-four-points',
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
