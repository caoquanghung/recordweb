// Increment whenever thumbnail extraction changes so bad older frames regenerate.
export const RECORDING_THUMBNAIL_VERSION = 2;

/** Reject an empty/near-black decoder surface, while retaining dark visible content. */
export function hasVisibleThumbnailPixels(pixels: Uint8ClampedArray): boolean {
  const minimum = Math.max(1, Math.ceil(pixels.length / 4 * 0.0005));
  let visible = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 16 && Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 16) {
      if (++visible >= minimum) return true;
    }
  }
  return false;
}

/** Only inspect the opening second, and never seek past a short clip's ending. */
export function thumbnailSeekTimes(durationSeconds: number): number[] {
  const end = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.max(0, durationSeconds - Math.min(0.01, durationSeconds / 10)) : 1;
  return [...new Set([0.05, 0.2, 0.5, 1].map((time) => Math.min(time, end)))].filter((time) => time > 0);
}
