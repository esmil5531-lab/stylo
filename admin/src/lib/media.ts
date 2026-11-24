/** Another size of an uploaded photo (…-320/800/1600.webp); other links are returned unchanged. */
export function mediaVariant(url: string | null | undefined, width: 320 | 800 | 1600): string {
  if (!url) return '';
  return url.replace(/-(320|800|1600)\.webp$/, `-${width}.webp`);
}

/** Same rule as the API: an uploaded photo or an http(s) link. */
export function isImageUrl(v: string): boolean {
  return /^\/uploads\/[a-z0-9/-]+-(320|800|1600)\.webp$/.test(v) || /^https?:\/\/\S+$/.test(v);
}

/** No HEIC here on purpose: iPhone Safari then converts the photo to JPEG before uploading. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
