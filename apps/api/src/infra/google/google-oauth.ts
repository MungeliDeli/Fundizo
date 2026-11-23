import { createHash } from 'node:crypto';
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { z } from 'zod';

/**
 * Google sign-in (OpenID Connect, authorization code flow with PKCE). Domain code only sees
 * this interface; tests use a fake (CLAUDE.md: every external system sits behind an adapter).
 */
export interface GoogleClaims {
  /** Google's stable account id ("sub"). Never use the email to identify a Google account. */
  subject: string;
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
}

export interface GoogleOAuth {
  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeVerifier: string;
    redirectUri: string;
  }): string;
  /** Exchange the code and return claims from a verified ID token. Throws on any problem. */
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<GoogleClaims>;
}

/** Null when Google sign-in isn't configured. */
export const GOOGLE_OAUTH = Symbol('GOOGLE_OAUTH');

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const TIMEOUT_MS = 10_000;

const TokenResponse = z.object({ id_token: z.string().min(20) });
const IdTokenClaims = z.object({
  sub: z.string().min(1).max(255),
  email: z.email(),
  email_verified: z.boolean(),
  nonce: z.string(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  name: z.string().optional(),
});

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export class GoogleOAuthClient implements GoogleOAuth {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    // Google's public signing keys, fetched and cached by jose; injectable for tests.
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(JWKS_URL)),
  ) {}

  authorizationUrl({
    state,
    nonce,
    codeVerifier,
    redirectUri,
  }: {
    state: string;
    nonce: string;
    codeVerifier: string;
    redirectUri: string;
  }): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return url.toString();
  }

  async exchangeCode({
    code,
    codeVerifier,
    redirectUri,
    nonce,
  }: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<GoogleClaims> {
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Google token exchange failed with ${res.status}`);
    const token = TokenResponse.parse(await res.json());
    return this.verifyIdToken(token.id_token, nonce);
  }

  /** Signature (Google's keys), issuer, audience (our client id), expiry, and our nonce. */
  async verifyIdToken(idToken: string, expectedNonce: string): Promise<GoogleClaims> {
    const { payload } = await jwtVerify(idToken, this.keys, {
      issuer: ISSUERS,
      audience: this.clientId,
    });
    const claims = IdTokenClaims.parse(payload);
    if (claims.nonce !== expectedNonce) throw new Error('Google ID token nonce mismatch');
    return {
      subject: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified,
      givenName: claims.given_name,
      familyName: claims.family_name,
      name: claims.name,
    };
  }
}
