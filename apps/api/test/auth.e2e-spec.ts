import type { INestApplication } from '@nestjs/common';
import { ApiErrorBody, SessionResponse } from '@fundizo/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ENV, parseEnv } from '../src/config/env.js';
import {
  browser,
  codeFrom,
  createTestApp,
  lastEmailTo,
  outbox,
  resetData,
  sessionCookie,
  tokenFrom,
} from './helpers.js';

// Email sign-up, verification, login, sessions and password reset (A-01, A-03), end to end
// against real Postgres + Redis, with emails read back from the dev outbox.

const mary = {
  firstName: 'Mary',
  lastName: 'Banda',
  email: 'mary@example.test',
  password: 'correct horse battery',
};

let app: INestApplication<App>;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => app.close());
beforeEach(async () => resetData());

async function signUpAndVerify(b = browser(app), person = mary) {
  await b.post('/auth/signup', person).expect(202);
  const code = codeFrom(await lastEmailTo(person.email));
  await b.post('/auth/verify-email', { email: person.email, code }).expect(200);
  return b;
}

const wrongLogin = () =>
  browser(app).post('/auth/login', { email: mary.email, password: 'wrong password!!' });
const errorCode = (res: request.Response) => ApiErrorBody.parse(res.body).error.code;

describe('sign-up and email verification', () => {
  it('sends a 6-digit code, and the right code signs you in', async () => {
    const b = browser(app);
    const res = await b
      .post('/auth/signup', { ...mary, email: '  Mary@Example.TEST ' })
      .expect(202);
    expect(res.body).toEqual({ ok: true });
    expect(sessionCookie(res)).toBeUndefined(); // not signed in until verified

    const mail = await lastEmailTo('mary@example.test');
    expect(mail?.tag).toBe('verify-email');
    expect(mail?.html).toContain('/verify-email?email=mary%40example.test&amp;code=');

    const verified = await b
      .post('/auth/verify-email', { email: mary.email, code: codeFrom(mail) })
      .expect(200);
    const cookie = sessionCookie(verified);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = SessionResponse.parse((await b.get('/auth/me').expect(200)).body);
    expect(me.user).toMatchObject({
      email: mary.email,
      firstName: 'Mary',
      emailVerified: true,
      hasPassword: true,
    });
    expect(JSON.stringify(me)).not.toMatch(/argon2|password_hash|passwordHash/);
  });

  it('gives the same answer for an existing email, and emails the owner instead', async () => {
    await signUpAndVerify();
    const res = await browser(app)
      .post('/auth/signup', { ...mary, password: 'another long password' })
      .expect(202);
    expect(res.body).toEqual({ ok: true });
    expect((await lastEmailTo(mary.email))?.tag).toBe('account-exists');
  });

  it('never changes the password of an unverified account from a second sign-up', async () => {
    await browser(app).post('/auth/signup', mary).expect(202);
    await browser(app)
      .post('/auth/signup', { ...mary, password: 'attacker chosen password' })
      .expect(202);
    const b = browser(app);
    await b
      .post('/auth/verify-email', {
        email: mary.email,
        code: codeFrom(await lastEmailTo(mary.email)),
      })
      .expect(200);
    await browser(app)
      .post('/auth/login', { email: mary.email, password: 'attacker chosen password' })
      .expect(401);
    await browser(app)
      .post('/auth/login', { email: mary.email, password: mary.password })
      .expect(200);
  });

  it('rejects a wrong code and locks the code after 5 tries', async () => {
    await browser(app).post('/auth/signup', mary).expect(202);
    const right = codeFrom(await lastEmailTo(mary.email));
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      expect(
        errorCode(
          await browser(app)
            .post('/auth/verify-email', { email: mary.email, code: wrong })
            .expect(400),
        ),
      ).toBe('invalid_code');
    }
    expect(
      errorCode(
        await browser(app)
          .post('/auth/verify-email', { email: mary.email, code: wrong })
          .expect(429),
      ),
    ).toBe('too_many_attempts');
    // Even the right code no longer works; a new one must be requested.
    await browser(app).post('/auth/verify-email', { email: mary.email, code: right }).expect(429);
  });

  it('only the newest code works after a resend', async () => {
    await browser(app).post('/auth/signup', mary).expect(202);
    const first = codeFrom(await lastEmailTo(mary.email));
    await browser(app).post('/auth/resend-verification', { email: mary.email }).expect(202);
    const second = codeFrom(await lastEmailTo(mary.email));
    if (first !== second) {
      expect(
        errorCode(
          await browser(app).post('/auth/verify-email', { email: mary.email, code: first }),
        ),
      ).toBe('invalid_code');
    }
    await browser(app).post('/auth/verify-email', { email: mary.email, code: second }).expect(200);
  });

  it('does not reveal unknown emails on resend or verify', async () => {
    await browser(app)
      .post('/auth/resend-verification', { email: 'nobody@example.test' })
      .expect(202);
    expect(await outbox()).toHaveLength(0);
    expect(
      errorCode(
        await browser(app).post('/auth/verify-email', {
          email: 'nobody@example.test',
          code: '123456',
        }),
      ),
    ).toBe('invalid_code');
  });

  it('validates input with field messages', async () => {
    const res = await browser(app)
      .post('/auth/signup', { ...mary, email: 'nope', password: 'short' })
      .expect(400);
    const body = ApiErrorBody.parse(res.body);
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.fields).toMatchObject({
      email: expect.any(String),
      password: expect.any(String),
    });
  });

  it('rejects unknown fields (no mass assignment)', async () => {
    await browser(app)
      .post('/auth/signup', { ...mary, emailVerifiedAt: '2026-01-01' })
      .expect(400);
  });
});

describe('login and sessions', () => {
  it('logs in with the right password only, with one generic error', async () => {
    await signUpAndVerify();
    const wrongPassword = await browser(app)
      .post('/auth/login', { email: mary.email, password: 'wrong password!!' })
      .expect(401);
    const noAccount = await browser(app)
      .post('/auth/login', { email: 'nobody@example.test', password: 'whatever pass' })
      .expect(401);
    expect(wrongPassword.body).toEqual(noAccount.body);
    expect(errorCode(wrongPassword)).toBe('invalid_credentials');

    const ok = await browser(app)
      .post('/auth/login', { email: 'MARY@example.test', password: mary.password })
      .expect(200);
    expect(sessionCookie(ok)).toBeDefined();
  });

  it('asks unverified people to confirm their email, and sends a new code', async () => {
    await browser(app).post('/auth/signup', mary).expect(202);
    const before = (await outbox()).length;
    const res = await browser(app)
      .post('/auth/login', { email: mary.email, password: mary.password })
      .expect(403);
    expect(errorCode(res)).toBe('email_not_verified');
    expect((await outbox()).length).toBe(before + 1);
  });

  it('logs out: the session stops working and the cookie is cleared', async () => {
    const b = await signUpAndVerify();
    const res = await b.post('/auth/logout').expect(204);
    expect(sessionCookie(res)).toMatch(/fz_session=;/);
    await b.get('/auth/me').expect(401);
  });

  it('logs out other devices but keeps this one', async () => {
    const phone = await signUpAndVerify();
    const laptop = browser(app);
    await laptop.post('/auth/login', { email: mary.email, password: mary.password }).expect(200);

    const res = await laptop.post('/auth/logout-others').expect(200);
    expect(res.body).toEqual({ revoked: 1 });
    await laptop.get('/auth/me').expect(200);
    await phone.get('/auth/me').expect(401);
  });

  it('requires a session for /auth/me', async () => {
    expect(errorCode(await request(app.getHttpServer()).get('/auth/me').expect(401))).toBe(
      'unauthenticated',
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', 'fz_session=made-up-token')
      .expect(401);
  });
});

describe('forgot and reset password', () => {
  it('emails a one-time link; the new password works, old sessions end', async () => {
    const oldSession = await signUpAndVerify();
    await browser(app).post('/auth/password/forgot', { email: mary.email }).expect(202);
    const mail = await lastEmailTo(mary.email);
    expect(mail?.tag).toBe('reset-password');
    const token = tokenFrom(mail);

    const b = browser(app);
    const res = await b
      .post('/auth/password/reset', { token, password: 'a brand new password' })
      .expect(200);
    expect(sessionCookie(res)).toBeDefined();
    await b.get('/auth/me').expect(200);
    await oldSession.get('/auth/me').expect(401);
    expect((await lastEmailTo(mary.email))?.tag).toBe('password-changed');

    await browser(app)
      .post('/auth/login', { email: mary.email, password: mary.password })
      .expect(401);
    await browser(app)
      .post('/auth/login', { email: mary.email, password: 'a brand new password' })
      .expect(200);
    // The link works once.
    expect(
      errorCode(
        await browser(app)
          .post('/auth/password/reset', { token, password: 'yet another password' })
          .expect(400),
      ),
    ).toBe('invalid_token');
  });

  it('resetting also verifies the email (the inbox was proven)', async () => {
    await browser(app).post('/auth/signup', mary).expect(202);
    await browser(app).post('/auth/password/forgot', { email: mary.email }).expect(202);
    const b = browser(app);
    await b
      .post('/auth/password/reset', {
        token: tokenFrom(await lastEmailTo(mary.email)),
        password: 'a brand new password',
      })
      .expect(200);
    expect(SessionResponse.parse((await b.get('/auth/me')).body).user.emailVerified).toBe(true);
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const res = await browser(app)
      .post('/auth/password/forgot', { email: 'nobody@example.test' })
      .expect(202);
    expect(res.body).toEqual({ ok: true });
    expect(await outbox()).toHaveLength(0);
  });
});

describe('session cookie in production settings', () => {
  it('is Secure, HttpOnly and SameSite=Lax by default', async () => {
    const secureApp = await createTestApp((b) =>
      b.overrideProvider(ENV).useValue(parseEnv({ ...process.env, SESSION_COOKIE_SECURE: 'true' })),
    );
    try {
      const b = browser(secureApp);
      await b.post('/auth/signup', mary).expect(202);
      const res = await b
        .post('/auth/verify-email', {
          email: mary.email,
          code: codeFrom(await lastEmailTo(mary.email)),
        })
        .expect(200);
      expect(sessionCookie(res)).toMatch(/; Secure/i);
      expect(sessionCookie(res)).toMatch(/HttpOnly/i);
      expect(sessionCookie(res)).toMatch(/SameSite=Lax/i);
    } finally {
      await secureApp.close();
    }
  });
});

describe('protections', () => {
  it('blocks state changes without the CSRF header', async () => {
    const res = await request(app.getHttpServer()).post('/auth/signup').send(mary).expect(403);
    expect(errorCode(res)).toBe('csrf_failed');
  });

  it('rate-limits repeated login attempts for one email', async () => {
    await signUpAndVerify();
    for (let i = 0; i < 10; i++) await wrongLogin().expect(401);
    const blocked = await wrongLogin().expect(429);
    expect(errorCode(blocked)).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('exposes the dev outbox outside production', async () => {
    await browser(app).post('/auth/signup', mary).expect(202);
    const res = await request(app.getHttpServer()).get('/dev/outbox').expect(200);
    expect(res.body.transport).toBe('outbox');
    expect(res.body.messages[0].to.email).toBe(mary.email);
  });
});
