import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';

export interface EmailContact {
  email: string;
  firstName: string;
}

/**
 * Contact details, for the notifications module ONLY (it sends what the person signed up for).
 * Kept separate from UserDirectory so other modules never get an email address by accident.
 */
@Injectable()
export class UserContacts {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** The verified email address, or null (we don't email unverified addresses). */
  async verifiedEmail(userId: string): Promise<EmailContact | null> {
    const [u] = await this.db
      .select({ email: users.email, firstName: users.firstName, verifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId));
    return u?.verifiedAt ? { email: u.email, firstName: u.firstName } : null;
  }
}
