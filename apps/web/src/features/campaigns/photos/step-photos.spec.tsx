import { CSRF_HEADER, type Photo } from '@fundizo/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepPhotos } from '../wizard/step-photos';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
// The canvas work needs a real browser; here we only check what happens around it.
vi.mock('./compress', () => ({
  PhotoPickError: class PhotoPickError extends Error {},
  compressPhoto: vi.fn(
    async (file: File) => new Blob([await file.arrayBuffer()], { type: 'image/jpeg' }),
  ),
}));

const ID = '0b9a5a3c-1f2e-4d5c-8b7a-6e5f4d3c2b1a';
const p = (n: number, sensitive = false): Photo => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  url: `/media/photos/${n}/w1200.webp`,
  thumbUrl: `/media/photos/${n}/w400.webp`,
  blurUrl: `/media/photos/${n}/blur.webp`,
  sensitive,
  width: 1200,
  height: 900,
});
const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  Object.values(router).forEach((f) => f.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

describe('StepPhotos', () => {
  it('uploads the picked photo as a raw JPEG with the CSRF header and shows it as the cover', async () => {
    fetchMock.mockImplementation(() => json({ photos: [p(1)] }, 201));
    const u = userEvent.setup();
    render(<StepPhotos campaignId={ID} initial={[]} />);
    expect(screen.getByText('0 of 10')).toBeInTheDocument();
    await u.upload(
      screen.getByLabelText('Add a cover photo'),
      new File(['jpeg-bytes'], 'mum.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByText('Cover')).toBeInTheDocument();
    expect(screen.getByText('1 of 10')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/api/campaigns/${ID}/photos`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('image/jpeg');
    expect(new Headers(init?.headers).get(CSRF_HEADER)).toBe('1');
  });

  it('explains a refused upload on the tile', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: 'bad_image', message: 'That photo is too small.' } }, 422),
    );
    const u = userEvent.setup();
    render(<StepPhotos campaignId={ID} initial={[]} />);
    await u.upload(
      screen.getByLabelText('Add a cover photo'),
      new File(['x'], 'tiny.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByText('Couldn’t add tiny.jpg')).toBeInTheDocument();
    expect(screen.getByText('That photo is too small.')).toBeInTheDocument();
  });

  it('makes another photo the cover, blurs and removes', async () => {
    const u = userEvent.setup();
    render(<StepPhotos campaignId={ID} initial={[p(1), p(2)]} />);

    fetchMock.mockImplementationOnce(() => json({ photos: [p(2), p(1)] }));
    await u.click(screen.getByRole('button', { name: 'Make cover' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/campaigns/${ID}/photos/${p(2).id}`),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ cover: true });

    fetchMock.mockImplementationOnce(() => json({ photos: [p(2, true), p(1)] }));
    await u.click(screen.getAllByRole('button', { name: 'Blur (sensitive)' })[0] as HTMLElement);
    expect(await screen.findByText('Shown blurred')).toBeInTheDocument();

    fetchMock.mockImplementationOnce(() => json({ photos: [p(1)] }));
    await u.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    await waitFor(() => expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('DELETE'));
    expect(await screen.findByText('1 of 10')).toBeInTheDocument();
  });

  it('continues to review', async () => {
    const u = userEvent.setup();
    render(<StepPhotos campaignId={ID} initial={[p(1)]} />);
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith(`/start/${ID}/review`);
  });
});
