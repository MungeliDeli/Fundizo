import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskPhone, type UpdateProfileRequest, type VerifyPhoneRequest } from '@fundizo/shared';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { Errors } from '../../common/app-error.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ENV, type Env } from '../../config/env.js';
import { oneTimeTokens, users, type UserRow } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import { MAILER, type Mailer } from '../../infra/mail/mailer.js';
import { phoneConfirmedMessage } from '../../infra/mail/templates.js';
import { MESSAGING, type Messaging } from '../../infra/sms/messaging.js';
import { hashSecret, newEmailCode, safeEqualHex } from './tokens.js';

const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * Profile (A-02) and phone confirmation by SMS code (A-13). Every method acts on the signed-in
 * user only (the user id comes from the session, never from the request body).
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(MESSAGING) private readonly sms: Messaging,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly limiter: RateLimiter,
  ) {}

  async updateProfile(userId: string, input: UpdateProfileRequest): Promise<UserRow> {
    const [user] = await this.db
      .update(users)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        province: input.province,
        district: input.district,
        language: input.language,
      })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw Errors.unauthenticated();
    return user;
  }

  /**
   * Text a 6-digit code to the number. Limits stop SMS-cost abuse ("SMS pumping"): per account,
   * per destination number, and per IP. Whether the number is used elsewhere is only revealed
   * after the code is entered, i.e. only to whoever holds that phone.
   */
  async sendPhoneCode(user: UserRow, phone: string, ip: string | undefined): Promise<void> {
    await this.limiter.consume(`phone:user:${user.id}`, 3, 15 * MINUTE);
    await this.limiter.consume(`phone:num:${this.numberKey(phone)}`, 5, 24 * HOUR);
    await this.limiter.consume(`phone:ip:${ip}`, 10, HOUR);

    const code = newEmailCode();
    await this.db.transaction(async (tx) => {
      // Only the newest code works.
      await tx
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(oneTimeTokens.userId, user.id),
            eq(oneTimeTokens.purpose, 'verify_phone'),
            isNull(oneTimeTokens.consumedAt),
          ),
        );
      await tx.insert(oneTimeTokens).values({
        userId: user.id,
        purpose: 'verify_phone',
        target: phone,
        tokenHash: this.codeHash(user.id, phone, code),
        expiresAt: new Date(Date.now() + PHONE_CODE_TTL_MS),
      });
    });

    try {
      // Plain ASCII and under 160 characters: one SMS, no unicode surcharge.
      await this.sms.send({
        to: phone,
        tag: 'verify-phone',
        text: `Fundizo: your code is ${code}. It expires in 10 minutes. Never share it. Fundizo staff will never ask for it.`,
      });
    } catch (err) {
      this.logger.error(
        { to: maskPhone(phone), reason: err instanceof Error ? err.message : String(err) },
        'phone code SMS failed',
      );
      throw Errors.smsFailed();
    }
  }

  async verifyPhone(user: UserRow, input: VerifyPhoneRequest): Promise<UserRow> {
    await this.limiter.consume(`phone:verify:${user.id}`, 20, HOUR);
    const [token] = await this.db
      .select()
      .from(oneTimeTokens)
      .where(
        and(
          eq(oneTimeTokens.userId, user.id),
          eq(oneTimeTokens.purpose, 'verify_phone'),
          eq(oneTimeTokens.target, input.phone),
          isNull(oneTimeTokens.consumedAt),
        ),
      )
      .orderBy(desc(oneTimeTokens.createdAt))
      .limit(1);
    if (!token || token.expiresAt.getTime() < Date.now()) throw Errors.codeExpired();
    if (token.attempts >= MAX_CODE_ATTEMPTS) throw Errors.tooManyAttempts();

    if (!safeEqualHex(token.tokenHash, this.codeHash(user.id, input.phone, input.code))) {
      await this.db
        .update(oneTimeTokens)
        .set({ attempts: sql`${oneTimeTokens.attempts} + 1` })
        .where(eq(oneTimeTokens.id, token.id));
      throw token.attempts + 1 >= MAX_CODE_ATTEMPTS
        ? Errors.tooManyAttempts()
        : Errors.invalidCode();
    }

    const updated = await this.db
      .transaction(async (tx) => {
        await tx
          .update(oneTimeTokens)
          .set({ consumedAt: new Date() })
          .where(eq(oneTimeTokens.id, token.id));
        const [owner] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phoneE164, input.phone), ne(users.id, user.id)))
          .limit(1);
        if (owner) throw Errors.phoneInUse();
        const [row] = await tx
          .update(users)
          .set({ phoneE164: input.phone, phoneVerifiedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        return row;
      })
      .catch((err: unknown) => {
        // Two accounts confirming the same number at the same moment: the unique index decides.
        if (isUniqueViolation(err)) throw Errors.phoneInUse();
        throw err;
      });
    if (!updated) throw Errors.unauthenticated();

    // Security notice to the account email; the number is masked.
    if (user.phoneE164 !== input.phone) {
      await this.mailer
        .send(
          phoneConfirmedMessage(
            { email: updated.email, name: `${updated.firstName} ${updated.lastName}` },
            updated.firstName,
            maskPhone(input.phone),
            new URL('/forgot-password', this.env.WEB_BASE_URL).toString(),
          ),
        )
        .catch((err: unknown) =>
          this.logger.error(
            { reason: err instanceof Error ? err.message : String(err) },
            'phone notice email failed',
          ),
        );
    }
    return updated;
  }

  private codeHash(userId: string, phone: string, code: string) {
    return hashSecret(code, this.env.AUTH_SECRET, `verify_phone:${userId}:${phone}`);
  }

  /** Rate-limit keys never contain raw phone numbers. */
  private numberKey(phone: string) {
    return hashSecret(phone, this.env.AUTH_SECRET, 'rl-phone').slice(0, 32);
  }
}

function isUniqueViolation(err: unknown): boolean {
  const cause = err instanceof Error && 'cause' in err ? err.cause : err;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}
