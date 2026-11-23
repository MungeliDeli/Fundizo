import type { INestApplication } from '@nestjs/common';
import { SessionResponse } from '@fundizo/shared';
import type request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ENV, parseEnv } from '../src/config/env.js';
import {
  GOOGLE_OAUTH,
  type GoogleClaims,
  type GoogleOAuth,
} from '../src/infra/google/google-oauth.js';
import {
  browser,
  codeFrom,
  createTestApp,
  lastEmailTo,
  resetData,
  sessionCookie,
  tokenFrom,
} from './helpers.js';

// "Continue with Google" (A-12), end to end against real Postgres + Redis, with a fake Google
// (no network). The real ID-token verification is unit-tested in google-oauth.spec.ts.

class FakeGoogle implements GoogleOAuth {
  private readonly codes = new Map<string, GoogleClaims | Error>();
  authorizationUrl({ state, nonce }: { state: string; nonce: string }) {
    return `https://accounts.google.test/auth?state=${state}&nonce=${nonce}`;
  }
  async exchangeCode({ code }: { code: string }): Promise<GoogleClaims> {
    const result = this.codes.get(code);
    if (!result) throw new Error('unknown code');
    if (result instanceof Error) throw result;
    return result;
  }
  willReturn(code: string, claims: GoogleClaims | Error) {
    this.codes.set(code, claims);
  }
}

const WEB = 'http://localhost:3000';
const fake = new FakeGoogle();
const maryGoogle: GoogleClaims = {
  subject: 'g-mary',
  email: 'mary@example.test',
  emailVerified: true,
  givenName: 'Mary',
  familyName: 'Banda',
};
const mary = {
  firstName: 'Mary',
  lastName: 'Banda',
  email: 'mary@example.test',
  password: 'correct horse battery',
};

let app: INestApplication<App>;
let plainApp: INestApplication<App>;
beforeAll(async () => {
  const env = parseEnv({
    ...process.env,
    WEB_BASE_URL: WEB,
    GOOGLE_CLIENT_ID: 'fundizo-test-client-id',
    GOOGLE_CLIENT_SECRET: 'fundizo-test-secret',
  });
  app = await createTestApp((b) =>
    b.overrideProvider(ENV).useValue(env).overrideProvider(GOOGLE_OAUTH).useValue(fake),
  );
  plainApp = await createTestApp(); // no Google credentials
});
afterAll(async () => {
  await app.close();
  await plainApp.close();
});
beforeEach(async () => resetData());

let codeCounter = 0;
const locationOf = (res: request.Response) => new URL(String(res.headers.location));
const errorOf = (res: request.Response) => locationOf(res).searchParams.get('error');
/** Click "Continue with Google", "pick" an account at the fake Google, come back. */
async function googleSignIn(
  b: ReturnType<typeof browser>,
  claims: GoogleClaims | Error,
  next = '/account',
) {
  const start = await b.get(`/auth/google/start?next=${encodeURIComponent(next)}`).expect(302);
  const state = locationOf(start).searchParams.get('state') ?? '';
  const code = `code-${++codeCounter}`;
  fake.willReturn(code, claims);
  const res = await b.get(`/auth/google/callback?code=${code}&state=${state}`).expect(302);
  return { res, location: locationOf(res), state, code };
}

const me = async (b: ReturnType<typeof browser>) =>
  SessionResponse.parse((await b.get('/auth/me').expect(200)).body).user;

async function signUpWithPassword(b = browser(app)) {
  await b.post('/auth/signup', mary).expect(202);
  await b
    .post('/auth/verify-email', {
      email: mary.email,
      code: codeFrom(await lastEmailTo(mary.email)),
    })
    .expect(200);
  return b;
}

describe('availability', () => {
  it('reports whether Google sign-in is configured', async () => {
    expect((await browser(app).get('/auth/providers').expect(200)).body).toEqual({ google: true });
    expect((await browser(plainApp).get('/auth/providers').expect(200)).body).toEqual({
      google: false,
    });
  });

  it('sends people back to login when Google is not configured', async () => {
    const res = await browser(plainApp).get('/auth/google/start').expect(302);
    expect(errorOf(res)).toBe('google_unavailable');
  });

  it('starts with PKCE state bound to this browser by an HttpOnly cookie', async () => {
    const res = await browser(app).get('/auth/google/start').expect(302);
    expect(res.headers.location).toMatch(
      /^https:\/\/accounts\.google\.test\/auth\?state=[\w-]{43}&nonce=[\w-]{43}$/,
    );
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('fz_oauth='))).toMatch(/HttpOnly/i);
  });
});

describe('signing in', () => {
  it('creates a verified, password-less account for a new person', async () => {
    const b = browser(app);
    const { location, res } = await googleSignIn(b, maryGoogle);
    expect(location.toString()).toBe(`${WEB}/account`);
    expect(sessionCookie(res)).toBeDefined();
    expect(await me(b)).toMatchObject({
      email: 'mary@example.test',
      firstName: 'Mary',
      lastName: 'Banda',
      emailVerified: true,
      hasPassword: false,
      googleLinked: true,
    });
  });

  it('finds the same account next time, by Google id', async () => {
    const first = browser(app);
    await googleSignIn(first, maryGoogle);
    const id = (await me(first)).id;
    const second = browser(app);
    // Even if the person changed their Google email, the stable id finds the account.
    await googleSignIn(second, { ...maryGoogle, email: 'mary.new@example.test' });
    expect((await me(second)).id).toBe(id);
  });

  it('links to an existing verified account with the same email; the password still works', async () => {
    const id = (await me(await signUpWithPassword())).id;
    const b = browser(app);
    await googleSignIn(b, maryGoogle);
    expect(await me(b)).toMatchObject({ id, hasPassword: true, googleLinked: true });
    await browser(app)
      .post('/auth/login', { email: mary.email, password: mary.password })
      .expect(200);
  });

  it('takes over an UNVERIFIED account and discards its unproven password', async () => {
    // Someone (maybe an attacker) signed up with Mary's email but never confirmed it.
    await browser(app)
      .post('/auth/signup', { ...mary, password: 'attacker chosen password' })
      .expect(202);
    const b = browser(app);
    await googleSignIn(b, maryGoogle);
    expect(await me(b)).toMatchObject({
      emailVerified: true,
      hasPassword: false,
      googleLinked: true,
    });
    await browser(app)
      .post('/auth/login', { email: mary.email, password: 'attacker chosen password' })
      .expect(401);
  });

  it('a Google-only person can set a password through "forgot password", then use both', async () => {
    await googleSignIn(browser(app), maryGoogle);
    // Password login fails with the usual generic message until a password exists.
    await browser(app)
      .post('/auth/login', { email: mary.email, password: 'any password at all' })
      .expect(401);

    await browser(app).post('/auth/password/forgot', { email: mary.email }).expect(202);
    const b = browser(app);
    await b
      .post('/auth/password/reset', {
        token: tokenFrom(await lastEmailTo(mary.email)),
        password: 'my new password here',
      })
      .expect(200);
    expect(await me(b)).toMatchObject({ hasPassword: true, googleLinked: true });
    await browser(app)
      .post('/auth/login', { email: mary.email, password: 'my new password here' })
      .expect(200);
    await googleSignIn(browser(app), maryGoogle);
  });

  it('never redirects off-site', async () => {
    const { location } = await googleSignIn(browser(app), maryGoogle, 'https://evil.test/steal');
    expect(location.toString()).toBe(`${WEB}/account`);
  });
});

describe('refusals', () => {
  it('rejects a callback in a different browser from the one that started (login CSRF)', async () => {
    const attacker = browser(app);
    const start = await attacker.get('/auth/google/start').expect(302);
    const state = locationOf(start).searchParams.get('state');
    fake.willReturn('code-attacker', maryGoogle);
    const victim = browser(app);
    const res = await victim
      .get(`/auth/google/callback?code=code-attacker&state=${state}`)
      .expect(302);
    expect(errorOf(res)).toBe('google_expired');
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('each sign-in attempt works once', async () => {
    const b = browser(app);
    const { state, code } = await googleSignIn(b, maryGoogle);
    const again = await b.get(`/auth/google/callback?code=${code}&state=${state}`).expect(302);
    expect(errorOf(again)).toBe('google_expired');
  });

  it('handles "cancel" on Google’s screen', async () => {
    const b = browser(app);
    const start = await b.get('/auth/google/start').expect(302);
    const state = locationOf(start).searchParams.get('state');
    expect(
      errorOf(await b.get(`/auth/google/callback?error=access_denied&state=${state}`).expect(302)),
    ).toBe('google_cancelled');
  });

  it('refuses Google emails that Google has not verified', async () => {
    const { location } = await googleSignIn(browser(app), { ...maryGoogle, emailVerified: false });
    expect(location.searchParams.get('error')).toBe('google_email_unverified');
  });

  it('reports a failed exchange without details', async () => {
    const { location, res } = await googleSignIn(browser(app), new Error('invalid_grant'));
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('google_failed');
    expect(sessionCookie(res)).toBeUndefined();
  });
});

describe('connecting Google from the account page', () => {
  it('links Google to the signed-in account without a new session', async () => {
    const b = await signUpWithPassword();
    // Any Google email works when you are already signed in: you chose to connect it.
    const { location, res } = await googleSignIn(b, {
      ...maryGoogle,
      email: 'mary.personal@gmail.test',
    });
    expect(location.toString()).toBe(`${WEB}/account?google=linked`);
    expect(sessionCookie(res)).toBeUndefined();
    expect((await me(b)).googleLinked).toBe(true);
  });

  it('refuses a Google account already linked to someone else', async () => {
    await googleSignIn(browser(app), { ...maryGoogle, email: 'other@example.test' });
    const b = await signUpWithPassword();
    const { location } = await googleSignIn(b, maryGoogle);
    expect(location.pathname).toBe('/account');
    expect(location.searchParams.get('error')).toBe('google_in_use');
    expect((await me(b)).googleLinked).toBe(false);
  });
});
