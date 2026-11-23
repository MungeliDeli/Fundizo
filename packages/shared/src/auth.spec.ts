import { describe, expect, it } from 'vitest';
import { EmailCode, LoginRequest, SignupRequest } from './auth.js';

const valid = {
  firstName: ' Mary ',
  lastName: 'Banda',
  email: ' Mary@Example.COM ',
  password: 'correct horse battery',
};

describe('SignupRequest', () => {
  it('trims names and normalises the email', () => {
    expect(SignupRequest.parse(valid)).toEqual({
      firstName: 'Mary',
      lastName: 'Banda',
      email: 'mary@example.com',
      password: 'correct horse battery',
    });
  });

  it('requires a 10+ character password that is not the email', () => {
    expect(SignupRequest.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    const sameAsEmail = SignupRequest.safeParse({
      ...valid,
      email: 'abcdefghij@x.co',
      password: 'ABCDEFGHIJ@x.co',
    });
    expect(sameAsEmail.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(SignupRequest.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });

  it('rejects bad emails and empty names', () => {
    expect(SignupRequest.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
    expect(SignupRequest.safeParse({ ...valid, firstName: '   ' }).success).toBe(false);
  });
});

describe('EmailCode', () => {
  it('accepts exactly six digits', () => {
    expect(EmailCode.parse(' 123456 ')).toBe('123456');
    expect(EmailCode.safeParse('12345').success).toBe(false);
    expect(EmailCode.safeParse('12345a').success).toBe(false);
  });
});

describe('LoginRequest', () => {
  it('does not apply sign-up password rules (old passwords still log in)', () => {
    expect(LoginRequest.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});
