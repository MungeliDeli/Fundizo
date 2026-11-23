'use client';

import { PHOTO_MAX, type Photo, PhotoListResponse } from '@fundizo/shared';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ApiError, apiDelete, apiPatch, apiUpload } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formError } from '@/features/auth/error-messages';
import { compressPhoto, PhotoPickError } from '../photos/compress';
import { PhotoImage } from '../photos/photo-image';
import { stepHref } from './steps';

type Pending = { key: string; name: string; error: string | null };

/** Step 5 (C-05): a cover photo and up to 9 more. Compressed on the phone, cleaned on the server. */
export function StepPhotos({ campaignId, initial }: { campaignId: string; initial: Photo[] }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = pending.some((p) => !p.error);
  const room = PHOTO_MAX - photos.length - pending.filter((p) => !p.error).length;
  const base = `/campaigns/${campaignId}/photos`;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > chosen.length) setError(`A fundraiser can have up to ${PHOTO_MAX} photos.`);
    const queue = chosen.map((f) => ({
      key: crypto.randomUUID(),
      name: f.name,
      error: null as string | null,
      file: f,
    }));
    setPending((p) => [
      ...p.filter((x) => !x.error),
      ...queue.map((q) => ({ key: q.key, name: q.name, error: null })),
    ]);
    // One at a time: kinder to slow connections, and the order stays the order they were picked.
    for (const item of queue) {
      try {
        const blob = await compressPhoto(item.file);
        const res = await apiUpload(base, blob, PhotoListResponse);
        setPhotos(res.photos);
        setPending((p) => p.filter((x) => x.key !== item.key));
      } catch (err) {
        const message =
          err instanceof PhotoPickError || err instanceof ApiError ? err.message : formError(err);
        setPending((p) => p.map((x) => (x.key === item.key ? { ...x, error: message } : x)));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function change(photoId: string, action: () => Promise<{ photos: Photo[] }>) {
    setBusyId(photoId);
    setError(null);
    try {
      setPhotos((await action()).photos);
    } catch (err) {
      setError(formError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex items-baseline justify-between gap-4">
        <p className="m-0 text-sm text-ink-2">
          The first photo is the cover. It’s what people see in WhatsApp and on Facebook.
        </p>
        <span className="tabular shrink-0 text-sm text-ink-3" aria-live="polite">
          {photos.length} of {PHOTO_MAX}
        </span>
      </div>

      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
        {photos.map((photo, i) => (
          <li
            key={photo.id}
            className={cn(
              'flex flex-col overflow-hidden rounded-2xl border bg-surface',
              i === 0 ? 'border-2 border-accent' : 'border-line',
            )}
          >
            <div className="relative">
              <PhotoImage
                photo={{ ...photo, sensitive: false }}
                size="thumb"
                alt={`Photo ${i + 1}`}
                className={cn('aspect-[4/3]', photo.sensitive && '[&_img]:blur-md')}
              />
              {i === 0 ? (
                <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                  Cover
                </span>
              ) : null}
              {photo.sensitive ? (
                <span className="absolute bottom-2 left-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-ground">
                  Shown blurred
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1 p-2">
              {i > 0 ? (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() =>
                    change(photo.id, () =>
                      apiPatch(`${base}/${photo.id}`, { cover: true }, PhotoListResponse),
                    )
                  }
                  className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink-2 hover:bg-sunk"
                >
                  <Icon name="star" size={14} />
                  Make cover
                </button>
              ) : null}
              <button
                type="button"
                aria-pressed={photo.sensitive}
                disabled={busyId !== null}
                onClick={() =>
                  change(photo.id, () =>
                    apiPatch(
                      `${base}/${photo.id}`,
                      { sensitive: !photo.sensitive },
                      PhotoListResponse,
                    ),
                  )
                }
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink-2 hover:bg-sunk"
              >
                <Icon name={photo.sensitive ? 'eye' : 'eyeOff'} size={14} />
                {photo.sensitive ? 'Show clearly' : 'Blur (sensitive)'}
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() =>
                  change(photo.id, () => apiDelete(`${base}/${photo.id}`, PhotoListResponse))
                }
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-bad hover:bg-bad-soft"
                aria-label={`Remove photo ${i + 1}`}
              >
                <Icon name="trash" size={14} />
                Remove
              </button>
            </div>
          </li>
        ))}

        {pending.map((p) => (
          <li
            key={p.key}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-sunk p-3 text-center"
          >
            {p.error ? (
              <>
                <span className="text-sm font-semibold text-bad">Couldn’t add {p.name}</span>
                <span className="text-xs text-ink-2">{p.error}</span>
              </>
            ) : (
              <>
                <span
                  className="size-6 animate-spin rounded-full border-2 border-line border-t-accent"
                  aria-hidden="true"
                />
                <span className="text-xs text-ink-2">Adding photo…</span>
              </>
            )}
          </li>
        ))}

        {room > 0 ? (
          <li>
            <label
              htmlFor={inputId}
              className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-ink-2 hover:border-accent hover:text-accent-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <Icon name="image" size={28} strokeWidth={1.6} />
              <span className="text-sm font-semibold">
                {photos.length === 0 ? 'Add a cover photo' : 'Add photos'}
              </span>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => void addFiles(e.target.files)}
              />
            </label>
          </li>
        ) : null}
      </ul>

      <p className="m-0 rounded-control bg-sunk px-4 py-3 text-sm text-ink-2">
        <strong className="text-ink">Medical photos?</strong> Choose “Blur (sensitive)” for anything
        graphic or private. Donors see it blurred until they choose to look. We also remove location
        data from every photo.
      </p>

      <Button
        size="lg"
        disabled={uploading}
        onClick={() => router.push(stepHref(campaignId, 'review'))}
        className="w-full sm:w-auto sm:self-start sm:px-10"
      >
        {uploading ? 'Adding photos…' : 'Continue'}
      </Button>
    </div>
  );
}
