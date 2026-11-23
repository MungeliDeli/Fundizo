import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { ENV, type Env } from '../../config/env.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import { sessions, users, type UserRow } from '../../db/schema/index.js';
import { hashSecret, newToken } from './tokens.js';

export const SESSION_COOKIE = 'fz_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export interface RequestMeta {
  ip: string | undefined;
  userAgent: string | undefined;
}

export interface ActiveSession {
  sessionId: string;
  user: UserRow;
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Opaque server-side sessions (ADR 0004). The browser holds the token; we store only its hash. */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(
    userId: string,
    meta: RequestMeta,
    tx: Database | Tx = this.db,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await tx.insert(sessions).values({
      userId,
      tokenHash: this.hash(token),
      expiresAt,
      ip: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 300),
    });
    return { token, expiresAt };
  }

  /** The active session and user for a cookie token, or null. */
  async resolve(token: string): Promise<ActiveSession | null> {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, this.hash(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (Date.now() - row.session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await this.db
        .update(sessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(sessions.id, row.session.id));
    }
    return { sessionId: row.session.id, user: row.user };
  }

  async revoke(token: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, this.hash(token)), isNull(sessions.revokedAt)));
  }

  /** "Log out of other devices": revoke every session of the user except this one. Returns how many. */
  async revokeOthers(userId: string, keepSessionId: string): Promise<number> {
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, userId),
          ne(sessions.id, keepSessionId),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });
    return rows.length;
  }

  async revokeAll(userId: string, tx: Database | Tx = this.db): Promise<void> {
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  private hash(token: string) {
    return hashSecret(token, this.env.AUTH_SECRET, 'session');
  }
}
