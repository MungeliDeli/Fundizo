import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';
import { LocalDiskStorage } from './local-disk.storage.js';

/**
 * Serves photos from local storage in development (the web app proxies /media/* here).
 * In production photos come from S3 + CDN and this route returns 404.
 */
@Controller('media')
export class MediaController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  @Get('*path')
  async get(@Param('path') path: string | string[], @Res() res: Response): Promise<void> {
    const key = Array.isArray(path) ? path.join('/') : path;
    const body = this.storage instanceof LocalDiskStorage ? await this.storage.read(key) : null;
    if (!body) throw new NotFoundException();
    res.setHeader('Content-Type', 'image/webp');
    // Keys are unique per upload, so a stored file never changes.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.end(body);
  }
}
