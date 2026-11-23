import type { PublicUser } from '@fundizo/shared';

/** An obviously fake user for component tests. */
export const testUser: PublicUser = {
  id: '7f1d4a7e-8a3b-4c2e-9d6f-1a2b3c4d5e6f',
  firstName: 'Mary',
  lastName: 'Banda',
  email: 'mary@example.test',
  emailVerified: true,
  hasPassword: true,
  googleLinked: false,
  province: null,
  district: null,
  language: 'en',
  phone: null,
  createdAt: '2026-11-23T10:00:00.000Z',
};
