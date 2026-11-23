import { Inject, Injectable } from '@nestjs/common';
import type { PublicUser } from '@fundizo/shared';
import { and, eq } from 'drizzle-orm';
import { userIdentities, type UserRow } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';

/** Builds the public view of a user. Never exposes hashes, tokens or internal status. */
@Injectable()
export class UserViewService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async publicUser(user: UserRow): Promise<PublicUser> {
    const [google] = await this.db
      .select({ id: userIdentities.id })
      .from(userIdentities)
      .where(and(eq(userIdentities.userId, user.id), eq(userIdentities.provider, 'google')))
      .limit(1);
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      hasPassword: user.passwordHash !== null,
      googleLinked: Boolean(google),
      createdAt: user.createdAt.toISOString(),
    };
  }
}
