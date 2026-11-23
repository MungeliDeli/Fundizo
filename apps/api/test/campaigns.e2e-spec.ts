import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorBody,
  OwnCampaignList,
  OwnCampaignResponse,
  PublicCampaignResponse,
} from '@fundizo/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { browser, codeFrom, createTestApp, lastEmailTo, lastSmsTo, resetData } from './helpers.js';

// Create and publish a fundraiser (C-01 – C-07), end to end against real Postgres + Redis.

let app: INestApplication<App>;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => app.close());
beforeEach(async () => resetData());

type B = ReturnType<typeof browser>;
let n = 0;
async function person(opts: { phone?: string; profile?: object } = {}): Promise<B> {
  const email = `organiser${++n}@example.test`;
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
  if (opts.profile)
    await b.agent.patch('/me/profile').set('x-fundizo-csrf', '1').send(opts.profile).expect(200);
  if (opts.phone) {
    await b.post('/me/phone/code', { phone: opts.phone }).expect(202);
    const e164 = `+260${opts.phone.replace(/\D/g, '').slice(1)}`;
    await b
      .post('/me/phone/verify', { phone: opts.phone, code: codeFrom(await lastSmsTo(e164)) })
      .expect(200);
  }
  return b;
}
const patch = (b: B, id: string, body: object) =>
  b.agent.patch(`/campaigns/${id}`).set('x-fundizo-csrf', '1').send(body);
const own = (res: request.Response) => OwnCampaignResponse.parse(res.body).campaign;
const errorOf = (res: request.Response) => ApiErrorBody.parse(res.body).error;

const complete = {
  category: 'medical',
  goalNgwee: 6_000_000,
  title: 'Help Joseph get his heart surgery at UTH',
  story: {
    whatHappened:
      'In October doctors at Kabwe General found a blocked heart valve and referred Joseph to UTH.',
    moneyFor: 'The operation and two weeks in hospital.',
    extra: '',
  },
};
const forJoseph = {
  kind: 'someone_else',
  name: 'Joseph Banda',
  relationship: 'Brother',
  phone: '0971234567',
};

async function draft(b: B, beneficiary: object = forJoseph) {
  return own(await b.post('/campaigns', { beneficiary }).expect(201));
}

describe('drafts', () => {
  it('creates a draft for someone else, defaulting the place to the organiser’s', async () => {
    const b = await person({
      profile: {
        firstName: 'Mary',
        lastName: 'Banda',
        province: 'Central',
        district: 'Kabwe',
        language: 'en',
      },
    });
    const c = await draft(b);
    expect(c).toMatchObject({
      status: 'draft',
      slug: null,
      beneficiary: {
        kind: 'someone_else',
        name: 'Joseph Banda',
        relationship: 'Brother',
        phone: '+260971234567',
      },
      province: 'Central',
      district: 'Kabwe',
      title: '',
    });
  });

  it('autosaves each step and lists the organiser’s fundraisers', async () => {
    const b = await person();
    const c = await draft(b, { kind: 'self' });
    await patch(b, c.id, { category: 'medical' }).expect(200);
    await patch(b, c.id, { goalNgwee: 6_000_000, endDate: '2027-02-01' }).expect(200);
    const saved = own(
      await patch(b, c.id, { title: complete.title, story: complete.story }).expect(200),
    );
    expect(saved).toMatchObject({
      category: 'medical',
      goalNgwee: 6_000_000,
      endDate: '2027-02-01',
      title: complete.title,
    });
    const list = OwnCampaignList.parse((await b.get('/campaigns/mine').expect(200)).body);
    expect(list.campaigns.map((x) => x.id)).toEqual([c.id]);
  });

  it('rejects floats, out-of-range goals and fields that must not be set directly', async () => {
    const b = await person();
    const c = await draft(b);
    await patch(b, c.id, { goalNgwee: 6000.5 }).expect(400);
    expect(
      errorOf(await patch(b, c.id, { goalNgwee: 5_000 }).expect(400)).fields?.goalNgwee,
    ).toMatch(/K100/);
    await patch(b, c.id, { status: 'published' }).expect(400);
    await patch(b, c.id, { slug: 'my-own-slug' }).expect(400);
    await patch(b, c.id, { ownerUserId: '00000000-0000-0000-0000-000000000000' }).expect(400);
  });

  it('keeps drafts private: other people get "not found", never "forbidden"', async () => {
    const mary = await person();
    const c = await draft(mary);
    const thief = await person();
    expect(errorOf(await thief.get(`/campaigns/${c.id}`).expect(404)).code).toBe('not_found');
    await patch(thief, c.id, { title: 'Hijacked' }).expect(404);
    await thief.post(`/campaigns/${c.id}/publish`).expect(404);
    expect(
      OwnCampaignList.parse((await thief.get('/campaigns/mine').expect(200)).body).campaigns,
    ).toEqual([]);
    expect(own(await mary.get(`/campaigns/${c.id}`).expect(200)).title).toBe('');
  });

  it('requires a session and the CSRF header', async () => {
    await request(app.getHttpServer())
      .post('/campaigns')
      .set('x-fundizo-csrf', '1')
      .send({ beneficiary: { kind: 'self' } })
      .expect(401);
    const b = await person();
    await b.agent
      .post('/campaigns')
      .send({ beneficiary: { kind: 'self' } })
      .expect(403);
  });

  it('validates ids', async () => {
    const b = await person();
    await b.get('/campaigns/not-a-uuid').expect(400);
  });
});

describe('publishing', () => {
  it('lists what is missing, by wizard step', async () => {
    const b = await person();
    const c = await draft(b);
    const err = errorOf(await b.post(`/campaigns/${c.id}/publish`).expect(422));
    expect(err.code).toBe('not_publishable');
    expect(Object.keys(err.fields ?? {})).toEqual(['category', 'goal', 'story', 'account']);
  });

  it('needs a confirmed phone, even when everything else is ready', async () => {
    const b = await person();
    const c = await draft(b);
    await patch(b, c.id, complete).expect(200);
    expect(errorOf(await b.post(`/campaigns/${c.id}/publish`).expect(422)).fields).toEqual({
      account: 'Confirm your phone number on your profile before publishing.',
    });
  });

  it('publishes with a readable address; the public page shows no phone numbers or emails', async () => {
    const b = await person({
      phone: '0961234567',
      profile: {
        firstName: 'Mary',
        lastName: 'Banda',
        province: 'Central',
        district: 'Kabwe',
        language: 'en',
      },
    });
    const c = await draft(b);
    await patch(b, c.id, complete).expect(200);
    const published = own(await b.post(`/campaigns/${c.id}/publish`).expect(200));
    expect(published.status).toBe('published');
    expect(published.slug).toMatch(/^help-joseph-get-his-heart-surgery-at-uth-[2-9a-z]{4}$/);

    const res = await request(app.getHttpServer())
      .get(`/public/campaigns/${published.slug}`)
      .expect(200);
    const pub = PublicCampaignResponse.parse(res.body).campaign;
    expect(pub).toMatchObject({
      title: complete.title,
      goalNgwee: 6_000_000,
      raisedNgwee: 0,
      donorCount: 0,
      district: 'Kabwe',
      organiser: { firstName: 'Mary', lastName: 'Banda' },
      beneficiary: { name: 'Joseph Banda', relationship: 'Brother' },
      verified: false,
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\+260|0971234567|0961234567|@example\.test/);
    expect(text).not.toMatch(/ownerUserId|"id"/);
  });

  it('publishing twice is harmless; live fundraisers can’t be edited yet', async () => {
    const b = await person({ phone: '0961234567' });
    const c = await draft(b);
    await patch(b, c.id, complete).expect(200);
    const first = own(await b.post(`/campaigns/${c.id}/publish`).expect(200));
    const second = own(await b.post(`/campaigns/${c.id}/publish`).expect(200));
    expect(second.slug).toBe(first.slug);
    await patch(b, c.id, { title: 'Changed after publishing' }).expect(409);
  });

  it('lets funerals publish without a goal', async () => {
    const b = await person({ phone: '0961234567' });
    const c = await draft(b, { kind: 'self' });
    await patch(b, c.id, { ...complete, category: 'funeral', goalNgwee: null }).expect(200);
    await b.post(`/campaigns/${c.id}/publish`).expect(200);
  });

  it('gives every fundraiser its own address, even with the same title', async () => {
    const b = await person({ phone: '0961234567' });
    const slugs = new Set<string | null>();
    for (let i = 0; i < 3; i++) {
      const c = await draft(b);
      await patch(b, c.id, complete).expect(200);
      slugs.add(own(await b.post(`/campaigns/${c.id}/publish`).expect(200)).slug);
    }
    expect(slugs.size).toBe(3);
  });
});

describe('public pages', () => {
  it('never shows drafts', async () => {
    const b = await person();
    await draft(b);
    await request(app.getHttpServer()).get('/public/campaigns/help-joseph-xxxx').expect(404);
  });

  it('rejects malformed addresses', async () => {
    await request(app.getHttpServer()).get('/public/campaigns/..%2F..%2Fetc').expect(400);
  });
});
