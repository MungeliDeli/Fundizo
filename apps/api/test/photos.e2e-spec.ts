import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorBody,
  OwnCampaignResponse,
  PhotoListResponse,
  PublicCampaignResponse,
} from '@fundizo/shared';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  browser,
  codeFrom,
  createTestApp,
  lastEmailTo,
  lastSmsTo,
  resetData,
  testJpeg,
} from './helpers.js';

// Fundraiser photos (C-05), end to end: upload → re-encode → stored files → served → public page.

let app: INestApplication<App>;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => app.close());
beforeEach(async () => resetData());

type B = ReturnType<typeof browser>;
let n = 0;
async function organiser(withPhone = false): Promise<B> {
  const email = `photos${++n}@example.test`;
  const b = browser(app);
  await b
    .post('/auth/signup', {
      firstName: 'Mary',
      lastName: 'Banda',
      email,
      password: 'correct horse battery',
    })
    .expect(202);
  await b
    .post('/auth/verify-email', { email, code: codeFrom(await lastEmailTo(email)) })
    .expect(200);
  if (withPhone) {
    await b.post('/me/phone/code', { phone: '0961234567' }).expect(202);
    await b
      .post('/me/phone/verify', {
        phone: '0961234567',
        code: codeFrom(await lastSmsTo('+260961234567')),
      })
      .expect(200);
  }
  return b;
}
async function draftOf(b: B): Promise<string> {
  const res = await b.post('/campaigns', { beneficiary: { kind: 'self' } }).expect(201);
  return OwnCampaignResponse.parse(res.body).campaign.id;
}
const upload = (b: B, id: string, body: Buffer, type = 'image/jpeg') =>
  b.agent
    .post(`/campaigns/${id}/photos`)
    .set('x-fundizo-csrf', '1')
    .set('Content-Type', type)
    .send(body);
const photosOf = (res: request.Response) => PhotoListResponse.parse(res.body).photos;
const errorOf = (res: request.Response) => ApiErrorBody.parse(res.body).error;
/** The API path for a public media URL (http://localhost:3000/media/… → /media/…). */
const mediaPath = (url: string) => new URL(url, 'http://localhost').pathname;

describe('uploading', () => {
  it('stores clean WebP versions (no EXIF, no GPS) and serves them', async () => {
    const b = await organiser();
    const id = await draftOf(b);
    const photos = photosOf(await upload(b, id, await testJpeg(2400, 1800)).expect(201));
    expect(photos).toHaveLength(1);
    const [photo] = photos;
    expect(photo).toMatchObject({ sensitive: false, width: 1200, height: 900 });
    expect(photo?.url).toMatch(/^\/media\/photos\/[0-9a-f-]{36}\/w1200\.webp$/);
    expect(photo?.url).not.toContain(id); // the campaign's internal id stays private

    for (const url of [photo?.url, photo?.thumbUrl, photo?.blurUrl]) {
      const res = await request(app.getHttpServer())
        .get(mediaPath(url ?? ''))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toBe('image/webp');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      const body: Buffer = Buffer.isBuffer(res.body) ? res.body : Buffer.alloc(0);
      const meta = await sharp(body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(body.includes(Buffer.from('TestPhone'))).toBe(false);
    }
  });

  it('refuses things that are not photos, even when labelled as JPEG', async () => {
    const b = await organiser();
    const id = await draftOf(b);
    expect(
      errorOf(await upload(b, id, Buffer.from('<svg onload=alert(1)>'), 'image/jpeg').expect(422))
        .code,
    ).toBe('bad_image');
    expect(errorOf(await upload(b, id, Buffer.from('hello'), 'text/plain').expect(415)).code).toBe(
      'bad_image',
    );
  });

  it('refuses photos over 8 MB before reading them', async () => {
    const b = await organiser();
    const id = await draftOf(b);
    const res = await upload(b, id, Buffer.alloc(8 * 1024 * 1024 + 1, 1)).expect(413);
    expect(errorOf(res)).toMatchObject({
      code: 'bad_image',
      message: 'That photo is too big. Use one under 8 MB.',
    });
  });

  it('allows up to 10 photos', async () => {
    const b = await organiser();
    const id = await draftOf(b);
    const jpeg = await testJpeg(640, 480);
    for (let i = 0; i < 10; i++) await upload(b, id, jpeg).expect(201);
    expect(errorOf(await upload(b, id, jpeg).expect(409)).code).toBe('too_many_photos');
  });
});

describe('managing photos', () => {
  it('makes any photo the cover, marks sensitive ones, and deletes for real', async () => {
    const b = await organiser();
    const id = await draftOf(b);
    await upload(b, id, await testJpeg()).expect(201);
    const two = photosOf(await upload(b, id, await testJpeg(800, 600)).expect(201));
    const [first, second] = two;
    expect(first?.width).toBe(1200);

    const coverRes = await b.agent
      .patch(`/campaigns/${id}/photos/${second?.id}`)
      .set('x-fundizo-csrf', '1')
      .send({ cover: true })
      .expect(200);
    expect(photosOf(coverRes).map((p) => p.id)).toEqual([second?.id, first?.id]);

    const sensRes = await b.agent
      .patch(`/campaigns/${id}/photos/${first?.id}`)
      .set('x-fundizo-csrf', '1')
      .send({ sensitive: true })
      .expect(200);
    expect(photosOf(sensRes).find((p) => p.id === first?.id)?.sensitive).toBe(true);

    const delRes = await b.agent
      .delete(`/campaigns/${id}/photos/${first?.id}`)
      .set('x-fundizo-csrf', '1')
      .expect(200);
    expect(photosOf(delRes).map((p) => p.id)).toEqual([second?.id]);
    await request(app.getHttpServer())
      .get(mediaPath(first?.url ?? ''))
      .expect(404);
  });

  it('nobody else can upload, change or delete your photos', async () => {
    const mary = await organiser();
    const id = await draftOf(mary);
    const [photo] = photosOf(await upload(mary, id, await testJpeg()).expect(201));
    const thief = await organiser();
    await upload(thief, id, await testJpeg()).expect(404);
    await thief.agent
      .patch(`/campaigns/${id}/photos/${photo?.id}`)
      .set('x-fundizo-csrf', '1')
      .send({ cover: true })
      .expect(404);
    await thief.agent
      .delete(`/campaigns/${id}/photos/${photo?.id}`)
      .set('x-fundizo-csrf', '1')
      .expect(404);
  });

  it('needs a session and the CSRF header', async () => {
    const b = await organiser();
    const id = await draftOf(b);
    await request(app.getHttpServer())
      .post(`/campaigns/${id}/photos`)
      .set('x-fundizo-csrf', '1')
      .set('Content-Type', 'image/jpeg')
      .send(await testJpeg())
      .expect(401);
    await b.agent
      .post(`/campaigns/${id}/photos`)
      .set('Content-Type', 'image/jpeg')
      .send(await testJpeg())
      .expect(403);
  });
});

describe('publishing and the public page', () => {
  it('needs a cover photo, then shows the photos publicly in order', async () => {
    const b = await organiser(true);
    const id = await draftOf(b);
    await b.agent
      .patch(`/campaigns/${id}`)
      .set('x-fundizo-csrf', '1')
      .send({
        category: 'medical',
        goalNgwee: 6_000_000,
        title: 'Help Mary get her heart surgery',
        story: {
          whatHappened: 'Doctors found a blocked heart valve and referred her to UTH for surgery.',
          moneyFor: 'The operation and two weeks in hospital.',
          extra: '',
        },
      })
      .expect(200);
    expect(errorOf(await b.post(`/campaigns/${id}/publish`).expect(422)).fields).toEqual({
      photos: 'Add a cover photo.',
    });

    const [photo] = photosOf(await upload(b, id, await testJpeg()).expect(201));
    await b.agent
      .patch(`/campaigns/${id}/photos/${photo?.id}`)
      .set('x-fundizo-csrf', '1')
      .send({ sensitive: true })
      .expect(200);
    const published = await b.post(`/campaigns/${id}/publish`).expect(200);
    const slug = OwnCampaignResponse.parse(published.body).campaign.slug ?? '';

    const pub = PublicCampaignResponse.parse(
      (await request(app.getHttpServer()).get(`/public/campaigns/${slug}`).expect(200)).body,
    ).campaign;
    expect(pub.photos).toHaveLength(1);
    expect(pub.photos[0]).toMatchObject({ id: photo?.id, sensitive: true });

    // Live fundraisers can't change photos yet (editing live fundraisers comes with re-verification).
    await upload(b, id, await testJpeg()).expect(409);
  });
});

describe('the media route', () => {
  it.each([
    '/media/../../etc/passwd',
    '/media/photos/x/w1200.webp',
    '/media/photos/%2e%2e/secret.webp',
  ])('refuses %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(404);
  });
});
