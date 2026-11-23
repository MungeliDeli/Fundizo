import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { users } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';

/** What other modules may know about a person. Never email, phone number or anything secret. */
export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  province: string | null;
  district: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}

/**
 * The identity module's public, read-only interface for other modules (CLAUDE.md: modules never
 * read each other's tables). Campaigns use it for organiser names and verification level.
 */
@Injectable()
export class UserDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(userId: string): Promise<UserSummary | null> {
    return (await this.getMany([userId])).get(userId) ?? null;
  }

  async getMany(userIds: string[]): Promise<Map<string, UserSummary>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        province: users.province,
        district: users.district,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(inArray(users.id, [...new Set(userIds)]));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          province: r.province,
          district: r.district,
          emailVerified: r.emailVerifiedAt !== null,
          phoneVerified: r.phoneVerifiedAt !== null,
        },
      ]),
    );
  }
}
