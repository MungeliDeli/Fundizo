import sharp, { type Metadata } from 'sharp';

export class BadImageError extends Error {}

export interface ProcessedImage {
  /** The full-size photo (up to 1200 px wide). */
  w1200: Buffer;
  /** Thumbnail for lists and galleries (400 px wide). */
  w400: Buffer;
  /** Heavily blurred stand-in for sensitive photos (shown until someone taps "Show photo"). */
  blur: Buffer;
  width: number;
  height: number;
}

const ACCEPTED = new Set(['jpeg', 'png', 'webp']);
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
/** Refuse decompression bombs: a 50-megapixel image is far bigger than any phone photo needs. */
const MAX_PIXELS = 50_000_000;

/**
 * Validates and re-encodes an uploaded photo (C-05, SECURITY.md uploads):
 * - the format is read from the bytes themselves, never from the client's Content-Type;
 * - the camera's orientation is applied, then ALL metadata (EXIF, GPS location) is dropped;
 *   sharp only copies metadata when asked to, and we never ask;
 * - only our WebP outputs are ever stored; the original upload is discarded.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new BadImageError('That file isn’t a photo we can read. Use a JPEG, PNG or WebP image.');
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) {
    throw new BadImageError('Use a JPEG, PNG or WebP photo.');
  }
  // Width/height after rotation (orientations 5–8 swap them).
  const rotated = (meta.orientation ?? 1) >= 5;
  const w = rotated ? meta.height : meta.width;
  const h = rotated ? meta.width : meta.height;
  if (!w || !h || w < MIN_WIDTH || h < MIN_HEIGHT) {
    throw new BadImageError(
      `That photo is too small. Use one at least ${MIN_WIDTH} × ${MIN_HEIGHT} pixels.`,
    );
  }

  const base = () => sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
  try {
    const full = await base()
      .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const [w400, blur] = await Promise.all([
      base().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
      base()
        .resize({ width: 600, withoutEnlargement: true })
        .blur(40)
        .webp({ quality: 60 })
        .toBuffer(),
    ]);
    return { w1200: full.data, w400, blur, width: full.info.width, height: full.info.height };
  } catch {
    throw new BadImageError('We couldn’t process that photo. Try a different one.');
  }
}
