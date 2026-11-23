'use client';

import type { Photo } from '@fundizo/shared';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

/**
 * A fundraiser photo. Sensitive photos (e.g. graphic medical images) show the server-blurred
 * version until the viewer taps "Show photo" (C-05). The clear version isn't downloaded until then.
 */
export function PhotoImage({
  photo,
  size = 'full',
  alt,
  className,
  priority = false,
}: {
  photo: Photo;
  size?: 'full' | 'thumb';
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const hidden = photo.sensitive && !revealed;
  const src = hidden ? photo.blurUrl : size === 'thumb' ? photo.thumbUrl : photo.url;
  return (
    <div className={cn('relative overflow-hidden bg-sunk', className)}>
      <img
        src={src}
        alt={hidden ? `${alt} (hidden: sensitive photo)` : alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className="h-full w-full object-cover"
      />
      {hidden ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/30 p-3 text-center text-surface">
          {size === 'full' ? (
            <p className="m-0 text-sm font-semibold drop-shadow">This photo may be upsetting.</p>
          ) : null}
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface/95 px-3.5 text-sm font-semibold text-ink"
          >
            <Icon name="eye" size={16} />
            Show photo
          </button>
        </div>
      ) : null}
    </div>
  );
}
