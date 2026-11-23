import { PHOTO_MAX_BYTES } from '@fundizo/shared';

const MAX_EDGE = 1600;
const QUALITY = 0.85;

export class PhotoPickError extends Error {}

/**
 * Shrink a photo on the phone before upload (C-05): a 4 MB camera photo becomes ~300 KB, which
 * matters on 3G. The camera's rotation is applied. The server still re-encodes and strips all
 * metadata; this step is about data cost, not security.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new PhotoPickError('That file isn’t a photo.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // e.g. HEIC on a browser that can't read it.
    throw new PhotoPickError(
      'This phone saved the photo in a format we can’t read. Choose a JPEG or PNG photo.',
    );
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoPickError('Your browser couldn’t prepare that photo.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new PhotoPickError('Your browser couldn’t prepare that photo.');
  if (blob.size > PHOTO_MAX_BYTES)
    throw new PhotoPickError('That photo is too big. Try another one.');
  return blob;
}
