import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BadImageError, processPhoto } from './image-processor.js';

/** A real JPEG carrying EXIF, including a GPS position, made in memory. */
async function phonePhoto(width = 1600, height = 1200) {
  return sharp({ create: { width, height, channels: 3, background: { r: 180, g: 83, b: 42 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'Fundizo Cam' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '14/1 26/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '28/1 27/1 0/1',
      },
    })
    .toBuffer();
}

describe('processPhoto', () => {
  it('re-encodes to WebP in three sizes and strips all metadata, including GPS', async () => {
    const input = await phonePhoto();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the input really carries EXIF
    const out = await processPhoto(input);
    for (const buf of [out.w1200, out.w400, out.blur]) {
      const meta = await sharp(buf).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(buf.includes(Buffer.from('TestPhone'))).toBe(false);
    }
    expect(out.width).toBe(1200);
    expect(out.height).toBe(900);
    expect((await sharp(out.w400).metadata()).width).toBe(400);
  });

  it('applies the camera rotation before dropping it', async () => {
    // A portrait photo stored sideways, with the camera's "rotate 90°" tag (EXIF orientation 6).
    const sideways = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: '#b4532a' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(sideways).metadata()).orientation).toBe(6);
    const out = await processPhoto(sideways);
    expect(out.width).toBeLessThan(out.height);
  });

  it('refuses files that are not images, whatever they claim to be', async () => {
    await expect(processPhoto(Buffer.from('<svg onload="alert(1)"></svg>'))).rejects.toThrow(
      BadImageError,
    );
    await expect(processPhoto(Buffer.from('%PDF-1.7 not a photo'))).rejects.toThrow(BadImageError);
  });

  it('refuses formats we don’t accept (e.g. GIF)', async () => {
    const gif = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#fff' },
    })
      .gif()
      .toBuffer();
    await expect(processPhoto(gif)).rejects.toThrow(/JPEG, PNG or WebP/);
  });

  it('refuses tiny images', async () => {
    await expect(processPhoto(await phonePhoto(200, 150))).rejects.toThrow(/too small/);
  });

  it('never enlarges small-but-valid photos', async () => {
    const out = await processPhoto(await phonePhoto(640, 480));
    expect(out.width).toBe(640);
  });
});
