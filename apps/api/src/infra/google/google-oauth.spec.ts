import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GoogleOAuthClient, pkceChallenge } from './google-oauth.js';

// Real verification logic, with our own key pair standing in for Google's published keys.
const CLIENT_ID = 'fundizo-test.apps.googleusercontent.com';
let privateKey: CryptoKey;
let client: GoogleOAuthClient;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  keys = createLocalJWKSet({ keys: [jwk] });
  client = new GoogleOAuthClient(CLIENT_ID, 'secret-value', fetch, keys);
});

function idToken(
  claims: Record<string, unknown>,
  opts: { iss?: string; aud?: string; exp?: string } = {},
) {
  return new SignJWT({ email: 'mary@example.test', email_verified: true, nonce: 'n-1', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('google-sub-123')
    .setIssuer(opts.iss ?? 'https://accounts.google.com')
    .setAudience(opts.aud ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

describe('GoogleOAuthClient', () => {
  it('builds an authorization URL with PKCE, state and nonce', () => {
    const url = new URL(
      client.authorizationUrl({
        state: 's-1',
        nonce: 'n-1',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'https://fz.test/api/auth/google/callback',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      state: 's-1',
      nonce: 'n-1',
      code_challenge: pkceChallenge('v'.repeat(43)),
      code_challenge_method: 'S256',
      redirect_uri: 'https://fz.test/api/auth/google/callback',
    });
  });

  it('accepts a valid ID token and lower-cases the email', async () => {
    const claims = await client.verifyIdToken(
      await idToken({ email: 'Mary@Example.TEST', given_name: 'Mary' }),
      'n-1',
    );
    expect(claims).toMatchObject({
      subject: 'google-sub-123',
      email: 'mary@example.test',
      emailVerified: true,
      givenName: 'Mary',
    });
  });

  it.each([
    ['another audience (token minted for a different app)', { aud: 'someone-else' }],
    ['another issuer', { iss: 'https://evil.test' }],
    ['an expired token', { exp: '-1m' }],
  ])('rejects %s', async (_label, opts) => {
    await expect(client.verifyIdToken(await idToken({}, opts), 'n-1')).rejects.toThrow();
  });

  it('rejects a replayed token with the wrong nonce', async () => {
    await expect(client.verifyIdToken(await idToken({}), 'other-nonce')).rejects.toThrow(/nonce/);
  });

  it('rejects a token signed by someone else', async () => {
    const other = await generateKeyPair('RS256');
    const forged = await new SignJWT({ email: 'x@y.test', email_verified: true, nonce: 'n-1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('x')
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setExpirationTime('5m')
      .sign(other.privateKey);
    await expect(client.verifyIdToken(forged, 'n-1')).rejects.toThrow();
  });

  it('sends the code verifier and secret to the token endpoint', async () => {
    const token = await idToken({});
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id_token: token }), { status: 200 }),
    );
    const c = new GoogleOAuthClient(CLIENT_ID, 'secret-value', fetchImpl, keys);
    await c.exchangeCode({
      code: 'c-1',
      codeVerifier: 'ver',
      redirectUri: 'https://fz.test/cb',
      nonce: 'n-1',
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : '');
    expect(Object.fromEntries(body)).toMatchObject({
      code: 'c-1',
      code_verifier: 'ver',
      client_secret: 'secret-value',
      grant_type: 'authorization_code',
    });
  });
});
