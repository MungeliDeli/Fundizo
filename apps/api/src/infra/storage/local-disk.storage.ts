import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { MEDIA_KEY, type ObjectStorage } from './object-storage.js';

/** Development/test storage: a local folder. Production uses S3 (slice 7). */
export class LocalDiskStorage implements ObjectStorage {
  private readonly root: string;

  constructor(
    dir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = resolve(dir);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async delete(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => rm(this.pathFor(k), { force: true })));
  }

  url(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  /** For the dev-only /media route. Null when the key is invalid or missing. */
  async read(key: string): Promise<Buffer | null> {
    if (!MEDIA_KEY.test(key)) return null;
    return readFile(this.pathFor(key)).catch(() => null);
  }

  private pathFor(key: string): string {
    if (!MEDIA_KEY.test(key)) throw new Error('Invalid storage key');
    const path = resolve(join(this.root, key));
    // Belt and braces: never leave the storage folder.
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return path;
  }
}
