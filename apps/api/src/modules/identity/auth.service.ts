import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  LoginRequest,
  PublicUser,
  ResetPasswordRequest,
  SignupRequest,
  VerifyEmailRequest,
} from '@fundizo/shared';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { Errors } from '../../common/app-error.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ENV, type Env } from '../../config/env.js';
import { oneTimeTokens, users, type UserRow } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import { MAILER, type Mailer, type MailMessage } from '../../infra/mail/mailer.js';
import {
  accountExistsMessage,
  passwordChangedMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from '../../infra/mail/templates.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.js';
import { SessionsService, type RequestMeta } from './sessions.service.js';
import { hashSecret, newEmailCode, newToken, safeEqualHex } from './tokens.js';

const MINUTE = 60;
const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export interface SignedIn {
  user: PublicUser;
  session: { token: string; expiresAt: Date };
}

/**
 * Email + password accounts (A-01) and sessions (A-03). Rules from ADR 0004:
 * no account enumeration, codes and tokens stored only as keyed hashes, every step rate-limited.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly sessions: SessionsService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Always answers the same way. An existing account gets an "already have an account" email. */
  async signup(input: SignupRequest, meta: RequestMeta): Promise<void> {
    await this.limiter.consume(`signup:ip:${meta.ip}`, 10, 60 * MINUTE);
    const existing = await this.findByEmail(input.email);

    if (existing) {
      // Quietly limit how often we email an existing person, so this can't be used to spam them.
      const allowed = await this.limiter
        .consume(`signup:exists:${this.key(input.email)}`, 3, 60 * MINUTE)
        .then(
          () => true,
          () => false,
        );
      if (!allowed) return;
      if (existing.emailVerifiedAt) {
        await this.send(
          accountExistsMessage(
            this.to(existing),
            existing.firstName,
            this.link('/login'),
            this.link('/forgot-password'),
          ),
        );
      } else {
        // Unverified: send a fresh code. Never change the stored password from an unverified sign-up.
        await this.sendVerificationCode(existing);
      }
      return;
    }

    const passwordHash = await hashPassword(input.password);
    const [user] = await this.db
      .insert(users)
      .values({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
      })
      .onConflictDoNothing()
      .returning();
    // A concurrent sign-up with the same email won the race: behave as "existing".
    if (user) await this.sendVerificationCode(user);
  }

  async resendVerification(email: string): Promise<void> {
    await this.limiter.consume(`resend:${this.key(email)}`, 3, 15 * MINUTE);
    const user = await this.findByEmail(email);
    if (user && !user.emailVerifiedAt) await this.sendVerificationCode(user);
  }

  /** Correct code: the email is verified and the person is signed in. */
  async verifyEmail(input: VerifyEmailRequest, meta: RequestMeta): Promise<SignedIn> {
    await this.limiter.consume(`verify:${this.key(input.email)}`, 20, 60 * MINUTE);
    const user = await this.findByEmail(input.email);
    if (!user) throw Errors.invalidCode();

    const [token] = await this.db
      .select()
      .from(oneTimeTokens)
      .where(
        and(
          eq(oneTimeTokens.userId, user.id),
          eq(oneTimeTokens.purpose, 'verify_email'),
          isNull(oneTimeTokens.consumedAt),
        ),
      )
      .orderBy(desc(oneTimeTokens.createdAt))
      .limit(1);
    if (!token || token.expiresAt.getTime() < Date.now()) throw Errors.codeExpired();
    if (token.attempts >= MAX_CODE_ATTEMPTS) throw Errors.tooManyAttempts();

    if (!safeEqualHex(token.tokenHash, this.codeHash(user.id, input.code))) {
      await this.db
        .update(oneTimeTokens)
        .set({ attempts: sql`${oneTimeTokens.attempts} + 1` })
        .where(eq(oneTimeTokens.id, token.id));
      throw token.attempts + 1 >= MAX_CODE_ATTEMPTS
        ? Errors.tooManyAttempts()
        : Errors.invalidCode();
    }

    return this.db.transaction(async (tx) => {
      // Consume every outstanding verification code; only one may ever succeed.
      await tx
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(oneTimeTokens.userId, user.id),
            eq(oneTimeTokens.purpose, 'verify_email'),
            isNull(oneTimeTokens.consumedAt),
          ),
        );
      const [verified] = await tx
        .update(users)
        .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
        .where(eq(users.id, user.id))
        .returning();
      const session = await this.sessions.create(user.id, meta, tx);
      return { user: toPublicUser(verified ?? user), session };
    });
  }

  async login(input: LoginRequest, meta: RequestMeta): Promise<SignedIn> {
    await this.limiter.consume(`login:ip:${meta.ip}`, 50, 15 * MINUTE);
    await this.limiter.consume(`login:email:${this.key(input.email)}`, 10, 15 * MINUTE);

    const user = await this.findByEmail(input.email);
    // Same work and same answer whether the account is missing, Google-only, or the password is wrong.
    const ok =
      user?.passwordHash && user.status === 'active'
        ? await verifyPassword(input.password, user.passwordHash)
        : await burnPasswordCheck(input.password);
    if (!ok || !user) throw Errors.invalidCredentials();

    if (!user.emailVerifiedAt) {
      await this.resendVerification(user.email).catch(() => undefined);
      throw Errors.emailNotVerified();
    }

    const session = await this.sessions.create(user.id, meta);
    return { user: toPublicUser(user), session };
  }

  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    await this.limiter.consume(`forgot:ip:${meta.ip}`, 20, 60 * MINUTE);
    await this.limiter.consume(`forgot:${this.key(email)}`, 3, 60 * MINUTE);
    const user = await this.findByEmail(email);
    if (!user || user.status !== 'active') return;

    const token = newToken();
    await this.db.insert(oneTimeTokens).values({
      userId: user.id,
      purpose: 'reset_password',
      tokenHash: this.tokenHash(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
    await this.send(
      resetPasswordMessage(
        this.to(user),
        user.firstName,
        this.link(`/reset-password?token=${token}`),
      ),
    );
  }

  /**
   * A valid link sets the password (this is also how a Google-only account adds one), proves the
   * inbox (so the email becomes verified), logs out every other session, and signs this browser in.
   */
  async resetPassword(input: ResetPasswordRequest, meta: RequestMeta): Promise<SignedIn> {
    await this.limiter.consume(`reset:ip:${meta.ip}`, 20, 60 * MINUTE);
    const [token] = await this.db
      .select()
      .from(oneTimeTokens)
      .where(
        and(
          eq(oneTimeTokens.tokenHash, this.tokenHash(input.token)),
          eq(oneTimeTokens.purpose, 'reset_password'),
          isNull(oneTimeTokens.consumedAt),
          gt(oneTimeTokens.expiresAt, sql`now()`),
        ),
      )
      .limit(1);
    if (!token) throw Errors.invalidToken();

    const passwordHash = await hashPassword(input.password);
    const result = await this.db.transaction(async (tx) => {
      const consumed = await tx
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(oneTimeTokens.userId, token.userId),
            eq(oneTimeTokens.purpose, 'reset_password'),
            isNull(oneTimeTokens.consumedAt),
          ),
        )
        .returning({ id: oneTimeTokens.id });
      // Lost a race with another tab using the same link.
      if (!consumed.some((c) => c.id === token.id)) throw Errors.invalidToken();

      const [user] = await tx
        .update(users)
        .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
        .where(eq(users.id, token.userId))
        .returning();
      if (!user) throw Errors.invalidToken();
      await this.sessions.revokeAll(user.id, tx);
      const session = await this.sessions.create(user.id, meta, tx);
      return { user, session };
    });

    await this.send(
      passwordChangedMessage(
        this.to(result.user),
        result.user.firstName,
        this.link('/forgot-password'),
      ),
    );
    return { user: toPublicUser(result.user), session: result.session };
  }

  private async sendVerificationCode(user: UserRow): Promise<void> {
    const code = newEmailCode();
    await this.db.transaction(async (tx) => {
      // Only the newest code works.
      await tx
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(oneTimeTokens.userId, user.id),
            eq(oneTimeTokens.purpose, 'verify_email'),
            isNull(oneTimeTokens.consumedAt),
          ),
        );
      await tx.insert(oneTimeTokens).values({
        userId: user.id,
        purpose: 'verify_email',
        tokenHash: this.codeHash(user.id, code),
        expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
      });
    });
    const link = this.link(`/verify-email?email=${encodeURIComponent(user.email)}&code=${code}`);
    await this.send(verifyEmailMessage(this.to(user), user.firstName, code, link));
  }

  /**
   * Email failures are logged and swallowed: the person can ask for a new code, and the response
   * must not differ (enumeration). TODO(F-09): move sending to the outbox + a retrying job.
   */
  private async send(message: MailMessage): Promise<void> {
    try {
      await this.mailer.send(message);
    } catch (err) {
      this.logger.error(
        { tag: message.tag, reason: err instanceof Error ? err.message : String(err) },
        'email send failed',
      );
    }
  }

  private findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
      .limit(1)
      .then((rows) => rows[0]);
  }

  private codeHash(userId: string, code: string) {
    return hashSecret(code, this.env.AUTH_SECRET, `verify_email:${userId}`);
  }

  private tokenHash(token: string) {
    return hashSecret(token, this.env.AUTH_SECRET, 'reset_password');
  }

  /** Rate-limit keys use a hash, so raw emails never sit in Redis. */
  private key(email: string) {
    return hashSecret(email.toLowerCase(), this.env.AUTH_SECRET, 'rl').slice(0, 32);
  }

  private link(path: string) {
    return new URL(path, this.env.WEB_BASE_URL).toString();
  }

  private to(user: UserRow) {
    return { email: user.email, name: `${user.firstName} ${user.lastName}` };
  }
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    hasPassword: user.passwordHash !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
