import { Inject, Injectable, Logger } from '@nestjs/common';
import { type GoogleSignInError, NAME_MAX, safeNextPath } from '@fundizo/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ENV, type Env } from '../../config/env.js';
import { oneTimeTokens, userIdentities, users, type UserRow } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import {
  GOOGLE_OAUTH,
  type GoogleClaims,
  type GoogleOAuth,
} from '../../infra/google/google-oauth.js';
import { ensureConnected, REDIS } from '../../infra/redis/redis.module.js';
import { SessionsService, type RequestMeta } from './sessions.service.js';
import { hashSecret, newToken, safeEqualHex } from './tokens.js';

const FLOW_TTL_S = 10 * 60;

/** A failed Google sign-in, with a reason the web app can explain. */
export class GoogleSignInFailure extends Error {
  constructor(readonly reason: GoogleSignInError) {
    super(`Google sign-in failed: ${reason}`);
  }
}

const PendingFlow = z.object({
  nonce: z.string(),
  codeVerifier: z.string(),
  next: z.string(),
  /** Set when a signed-in user is connecting Google to their account (from /account). */
  linkUserId: z.uuid().nullable(),
});
type PendingFlow = z.infer<typeof PendingFlow>;

export interface GoogleResult {
  /** A new session, unless the person was already signed in and just linked Google. */
  session: { token: string; expiresAt: Date } | null;
  next: string;
}

/**
 * "Continue with Google" (A-12). OpenID Connect code flow with PKCE, a one-time state bound to
 * this browser by a cookie, and a nonce checked inside the ID token. Linking rules (ADR 0004):
 * a Google account links to an existing account only through a VERIFIED email; an unverified
 * account with that email is taken over and its unproven password discarded.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuth | null,
    private readonly sessions: SessionsService,
    private readonly limiter: RateLimiter,
  ) {}

  get redirectUri(): string {
    return new URL('/api/auth/google/callback', this.env.WEB_BASE_URL).toString();
  }

  /** Begin: returns Google's URL and the state value to bind to this browser (cookie). */
  async start(input: {
    next: unknown;
    linkUserId: string | null;
    ip: string | undefined;
  }): Promise<{ url: string; state: string }> {
    if (!this.google) throw new GoogleSignInFailure('unavailable');
    await this.limiter.consume(`google:ip:${input.ip}`, 30, 10 * 60).catch(() => {
      throw new GoogleSignInFailure('failed');
    });
    const state = newToken();
    const flow: PendingFlow = {
      nonce: newToken(),
      codeVerifier: newToken(),
      next: safeNextPath(input.next),
      linkUserId: input.linkUserId,
    };
    await ensureConnected(this.redis);
    await this.redis.set(this.flowKey(state), JSON.stringify(flow), 'EX', FLOW_TTL_S);
    const url = this.google.authorizationUrl({
      state,
      nonce: flow.nonce,
      codeVerifier: flow.codeVerifier,
      redirectUri: this.redirectUri,
    });
    return { url, state };
  }

  /** Google sent the person back. Every check must pass before anyone is signed in. */
  async callback(input: {
    code: unknown;
    state: unknown;
    error: unknown;
    cookieState: string | undefined;
    meta: RequestMeta;
  }): Promise<GoogleResult> {
    if (!this.google) throw new GoogleSignInFailure('unavailable');
    if (typeof input.error === 'string') throw new GoogleSignInFailure('cancelled');
    if (typeof input.code !== 'string' || typeof input.state !== 'string' || !input.cookieState) {
      throw new GoogleSignInFailure('expired');
    }
    // The state must match the cookie set in THIS browser (stops login CSRF / session fixation).
    if (!safeEqualHex(this.stateHash(input.state), this.stateHash(input.cookieState))) {
      throw new GoogleSignInFailure('expired');
    }
    await ensureConnected(this.redis);
    // GETDEL: each state works exactly once.
    const raw = await this.redis.getdel(this.flowKey(input.state));
    if (!raw) throw new GoogleSignInFailure('expired');
    const flow = PendingFlow.parse(JSON.parse(raw));

    let claims: GoogleClaims;
    try {
      claims = await this.google.exchangeCode({
        code: input.code,
        codeVerifier: flow.codeVerifier,
        redirectUri: this.redirectUri,
        nonce: flow.nonce,
      });
    } catch (err) {
      this.logger.warn(
        { reason: err instanceof Error ? err.message : String(err) },
        'Google code exchange failed',
      );
      throw new GoogleSignInFailure('failed');
    }
    if (!claims.emailVerified) throw new GoogleSignInFailure('email_unverified');

    return flow.linkUserId
      ? this.link(flow.linkUserId, flow, claims)
      : this.signIn(flow, claims, input.meta);
  }

  /** Signed-in user connecting Google from their account page. */
  private async link(
    userId: string,
    flow: PendingFlow,
    claims: GoogleClaims,
  ): Promise<GoogleResult> {
    const [existing] = await this.db
      .select()
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, 'google'), eq(userIdentities.subject, claims.subject)))
      .limit(1);
    if (existing && existing.userId !== userId) throw new GoogleSignInFailure('in_use');
    if (!existing) {
      const inserted = await this.db
        .insert(userIdentities)
        .values({ userId, provider: 'google', subject: claims.subject, email: claims.email })
        .onConflictDoNothing()
        .returning({ id: userIdentities.id });
      // This account already has a different Google account connected.
      if (inserted.length === 0) throw new GoogleSignInFailure('in_use');
    }
    return { session: null, next: flow.next };
  }

  private async signIn(
    flow: PendingFlow,
    claims: GoogleClaims,
    meta: RequestMeta,
  ): Promise<GoogleResult> {
    const session = await this.db.transaction(async (tx) => {
      // 1. Returning Google user.
      const [linked] = await tx
        .select({ user: users })
        .from(userIdentities)
        .innerJoin(users, eq(users.id, userIdentities.userId))
        .where(
          and(eq(userIdentities.provider, 'google'), eq(userIdentities.subject, claims.subject)),
        )
        .limit(1);
      let user: UserRow | undefined = linked?.user;

      if (!user) {
        const [byEmail] = await tx
          .select()
          .from(users)
          .where(eq(sql`lower(${users.email})`, claims.email))
          .limit(1);
        if (byEmail?.emailVerifiedAt) {
          // 2. Existing account, email already proven: link Google to it.
          user = byEmail;
        } else if (byEmail) {
          // 3. Existing UNVERIFIED account: Google proves the inbox now. Whoever set the password
          //    never proved they own this email, so the password is discarded (ADR 0004).
          const [taken] = await tx
            .update(users)
            .set({ emailVerifiedAt: new Date(), passwordHash: null })
            .where(eq(users.id, byEmail.id))
            .returning();
          await tx
            .update(oneTimeTokens)
            .set({ consumedAt: new Date() })
            .where(and(eq(oneTimeTokens.userId, byEmail.id), isNull(oneTimeTokens.consumedAt)));
          await this.sessions.revokeAll(byEmail.id, tx);
          user = taken;
        } else {
          // 4. New person.
          const names = splitNames(claims);
          const [created] = await tx
            .insert(users)
            .values({
              email: claims.email,
              firstName: names.first,
              lastName: names.last,
              emailVerifiedAt: new Date(),
              passwordHash: null,
            })
            .returning();
          user = created;
        }
        if (!user) throw new GoogleSignInFailure('failed');
        await tx.insert(userIdentities).values({
          userId: user.id,
          provider: 'google',
          subject: claims.subject,
          email: claims.email,
        });
      }

      if (user.status !== 'active') throw new GoogleSignInFailure('failed');
      return this.sessions.create(user.id, meta, tx);
    });
    return { session, next: flow.next };
  }

  private flowKey(state: string) {
    return `oauth:google:${this.stateHash(state)}`;
  }

  private stateHash(state: string) {
    return hashSecret(state, this.env.AUTH_SECRET, 'oauth-state');
  }
}

const clip = (v: string) => v.trim().slice(0, NAME_MAX);

/** First and last name from Google's profile, falling back to the full name, then the email. */
export function splitNames(
  claims: Pick<GoogleClaims, 'givenName' | 'familyName' | 'name' | 'email'>,
): { first: string; last: string } {
  if (claims.givenName?.trim())
    return { first: clip(claims.givenName), last: clip(claims.familyName ?? '') };
  const parts = (claims.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 0)
    return { first: clip(parts[0] ?? ''), last: clip(parts.slice(1).join(' ')) };
  return { first: clip(claims.email.split('@')[0] ?? 'Friend'), last: '' };
}
