/**
 * Where processed photos live (C-05). Domain code only sees this interface (CLAUDE.md adapters):
 * a local folder in development and tests, S3 + CDN in production (slice 7).
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
  /** Public URL for a stored object. */
  url(key: string): string;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** Every key we create looks like this; anything else is refused (no path tricks). */
export const MEDIA_KEY = /^photos\/[0-9a-f-]{36}\/(w1200|w400|blur)\.webp$/;
