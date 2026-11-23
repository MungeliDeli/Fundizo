import { describe, expect, it } from 'vitest';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.js';
import { hashSecret, newEmailCode, newToken, safeEqualHex } from './tokens.js';

describe('passwords', () => {
  it('hashes with Argon2id and verifies', async () => {
    const phc = await hashPassword('correct horse battery');
    expect(phc.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await verifyPassword('correct horse battery', phc)).toBe(true);
    expect(await verifyPassword('wrong horse battery', phc)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('always fails the timing-equaliser check', async () => {
    expect(await burnPasswordCheck('anything')).toBe(false);
  });
});

describe('tokens', () => {
  it('makes 6-digit codes and long random tokens', () => {
    for (let i = 0; i < 200; i++) expect(newEmailCode()).toMatch(/^\d{6}$/);
    expect(newToken()).toMatch(/^[\w-]{43}$/);
    expect(newToken()).not.toBe(newToken());
  });

  it('hashes with a key and context', () => {
    const a = hashSecret('123456', 'key-1', 'user-a');
    expect(a).toHaveLength(64);
    expect(hashSecret('123456', 'key-2', 'user-a')).not.toBe(a);
    expect(hashSecret('123456', 'key-1', 'user-b')).not.toBe(a);
    expect(safeEqualHex(a, hashSecret('123456', 'key-1', 'user-a'))).toBe(true);
  });
});
