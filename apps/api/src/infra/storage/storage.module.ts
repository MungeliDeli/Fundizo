import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { LocalDiskStorage } from './local-disk.storage.js';
import { MediaController } from './media.controller.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ENV],
      useFactory: (env: Env): ObjectStorage => {
        if (env.STORAGE_DRIVER === 's3') {
          throw new Error(
            'S3 storage arrives with the AWS slice (F-03). Use STORAGE_DRIVER=local for now.',
          );
        }
        // Relative by default: photos load from whichever address the page was opened on (the web
        // app proxies /media to the API). Production sets MEDIA_PUBLIC_BASE_URL to the CDN.
        const publicBase = env.MEDIA_PUBLIC_BASE_URL ?? '/media';
        return new LocalDiskStorage(
          resolve(import.meta.dirname, '../../..', env.STORAGE_LOCAL_DIR),
          publicBase,
        );
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
