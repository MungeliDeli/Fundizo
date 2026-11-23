import type { INestApplication } from '@nestjs/common';
import { ApiErrorBody, SessionResponse } from '@fundizo/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MESSAGING } from '../src/infra/sms/messaging.js';
import {
  browser,
  codeFrom,
  createTestApp,
  lastEmailTo,
  lastSmsTo,
  resetData,
  smsOutbox,
} from './helpers.js';

// Profile (A-02) and phone confirmation by SMS (A-13), end to end against real Postgres + Redis,
// with texts read back from the dev SMS outbox.

let app: INestApplication<App>;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => app.close());
beforeEach(async () => resetData());

let n = 0;
/** A fresh, confirmed, signed-in account. */
async function signedIn(firstName = 'Mary') {
  const email = `person${++n}@example.test`;
  const b = browser(app);
  await b
    .post('/auth/signup', {
      firstName,
      lastName: 'Banda',
      email,
      password: 'correct horse battery',
    })
    .expect(202);
  await b
    .post('/auth/verify-email', { email, code: codeFrom(await lastEmailTo(email)) })
    .expect(200);
  return b;
}

const me = async (b: ReturnType<typeof browser>) =>
  SessionResponse.parse((await b.get('/auth/me').expect(200)).body).user;
const errorCode = (res: request.Response) => ApiErrorBody.parse(res.body).error.code;
const profile = {
  firstName: 'Mary',
  lastName: 'Mwila',
  province: 'Central',
  district: 'Kabwe',
  language: 'bem',
};

async function confirmPhone(b: ReturnType<typeof browser>, phone = '096 123 4567') {
  await b.post('/me/phone/code', { phone }).expect(202);
  const sms = await lastSmsTo('+260961234567');
  return b.post('/me/phone/verify', { phone, code: codeFrom(sms) });
}

describe('profile', () => {
  it('starts with English and no district or phone', async () => {
    expect(await me(await signedIn())).toMatchObject({
      language: 'en',
      province: null,
      district: null,
      phone: null,
    });
  });

  it('saves name, province, district and language', async () => {
    const b = await signedIn();
    const res = await b.agent
      .patch('/me/profile')
      .set('x-fundizo-csrf', '1')
      .send(profile)
      .expect(200);
    expect(SessionResponse.parse(res.body).user).toMatchObject(profile);
    expect(await me(b)).toMatchObject(profile);
  });

  it('validates with field messages and rejects extra fields (e.g. trying to set a phone)', async () => {
    const b = await signedIn();
    const bad = await b.agent
      .patch('/me/profile')
      .set('x-fundizo-csrf', '1')
      .send({ ...profile, firstName: ' ', province: 'Gauteng' })
      .expect(400);
    expect(ApiErrorBody.parse(bad.body).error.fields).toMatchObject({
      firstName: expect.any(String),
      province: expect.any(String),
    });
    await b.agent
      .patch('/me/profile')
      .set('x-fundizo-csrf', '1')
      .send({ ...profile, phone: '+260961234567' })
      .expect(400);
  });

  it('requires a session and the CSRF header', async () => {
    await request(app.getHttpServer())
      .patch('/me/profile')
      .set('x-fundizo-csrf', '1')
      .send(profile)
      .expect(401);
    const b = await signedIn();
    await b.agent.patch('/me/profile').send(profile).expect(403);
  });
});

describe('phone confirmation', () => {
  it('texts a 6-digit code; the right code confirms the number', async () => {
    const b = await signedIn();
    await b.post('/me/phone/code', { phone: '096 123 4567' }).expect(202);
    const sms = await lastSmsTo('+260961234567');
    expect(sms?.text).toMatch(/^Fundizo: your code is \d{6}\./);
    expect(sms?.text.length).toBeLessThanOrEqual(160);

    const res = await b
      .post('/me/phone/verify', { phone: '0961234567', code: codeFrom(sms) })
      .expect(200);
    expect(SessionResponse.parse(res.body).user.phone).toBe('+260961234567');
    expect((await lastEmailTo(`person${n}@example.test`))?.tag).toBe('phone-confirmed');
    expect((await lastEmailTo(`person${n}@example.test`))?.text).toContain('+26096***567');
  });

  it('rejects a bad number before sending anything', async () => {
    const b = await signedIn();
    const res = await b.post('/me/phone/code', { phone: '12345' }).expect(400);
    expect(ApiErrorBody.parse(res.body).error.fields?.phone).toMatch(/Zambian mobile number/);
    expect(await smsOutbox()).toHaveLength(0);
  });

  it('a code only works for the number it was sent to', async () => {
    const b = await signedIn();
    await b.post('/me/phone/code', { phone: '0961234567' }).expect(202);
    const code = codeFrom(await lastSmsTo('+260961234567'));
    expect(
      errorCode(await b.post('/me/phone/verify', { phone: '0971234567', code }).expect(400)),
    ).toBe('code_expired');
  });

  it('locks the code after 5 wrong tries', async () => {
    const b = await signedIn();
    await b.post('/me/phone/code', { phone: '0961234567' }).expect(202);
    const right = codeFrom(await lastSmsTo('+260961234567'));
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++)
      await b.post('/me/phone/verify', { phone: '0961234567', code: wrong }).expect(400);
    expect(
      errorCode(await b.post('/me/phone/verify', { phone: '0961234567', code: wrong }).expect(429)),
    ).toBe('too_many_attempts');
    await b.post('/me/phone/verify', { phone: '0961234567', code: right }).expect(429);
  });

  it('a number can be confirmed on only one account', async () => {
    const first = await signedIn('Mary');
    expect((await confirmPhone(first)).status).toBe(200);
    const second = await signedIn('Joseph');
    const res = await confirmPhone(second);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('phone_in_use');
    expect((await me(second)).phone).toBeNull();
  });

  it('lets you change to a new number', async () => {
    const b = await signedIn();
    expect((await confirmPhone(b)).status).toBe(200);
    await b.post('/me/phone/code', { phone: '0771234567' }).expect(202);
    await b
      .post('/me/phone/verify', {
        phone: '0771234567',
        code: codeFrom(await lastSmsTo('+260771234567')),
      })
      .expect(200);
    expect((await me(b)).phone).toBe('+260771234567');
  });

  it('limits how many codes one account can request (SMS cost abuse)', async () => {
    const b = await signedIn();
    for (let i = 0; i < 3; i++) await b.post('/me/phone/code', { phone: '0961234567' }).expect(202);
    const res = await b.post('/me/phone/code', { phone: '0961234567' }).expect(429);
    expect(errorCode(res)).toBe('rate_limited');
  });

  it('limits codes to one number across accounts', async () => {
    for (let i = 0; i < 5; i++)
      await (await signedIn()).post('/me/phone/code', { phone: '0961234567' }).expect(202);
    expect(
      errorCode(
        await (await signedIn()).post('/me/phone/code', { phone: '0961234567' }).expect(429),
      ),
    ).toBe('rate_limited');
  });

  it('requires a session', async () => {
    await request(app.getHttpServer())
      .post('/me/phone/code')
      .set('x-fundizo-csrf', '1')
      .send({ phone: '0961234567' })
      .expect(401);
  });
});

describe('when the SMS provider fails', () => {
  let failing: INestApplication<App>;
  beforeAll(async () => {
    failing = await createTestApp((b) =>
      b
        .overrideProvider(MESSAGING)
        .useValue({ send: () => Promise.reject(new Error('402 not enough credits')) }),
    );
  });
  afterAll(async () => failing.close());

  it('says so plainly instead of pretending the code was sent', async () => {
    const email = 'fail@example.test';
    const b = browser(failing);
    await b
      .post('/auth/signup', {
        firstName: 'F',
        lastName: 'L',
        email,
        password: 'correct horse battery',
      })
      .expect(202);
    await b
      .post('/auth/verify-email', { email, code: codeFrom(await lastEmailTo(email)) })
      .expect(200);
    const res = await b.post('/me/phone/code', { phone: '0961234567' }).expect(503);
    expect(errorCode(res)).toBe('sms_failed');
  });
});
